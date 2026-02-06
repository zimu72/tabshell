#!/usr/bin/env node
/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
process.noAsar = true
import { build as builder } from 'electron-builder'
import * as vars from './vars.mjs'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import * as url from 'url'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const distDir = path.join(projectRoot, 'dist')
const builderCacheDir = path.join(projectRoot, '.cache', 'electron-builder')

if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true })
}
if (fs.existsSync(builderCacheDir)) {
    fs.rmSync(builderCacheDir, { recursive: true, force: true })
}
process.env.ELECTRON_BUILDER_CACHE = builderCacheDir

const isTag = (process.env.GITHUB_REF || '').startsWith('refs/tags/')

process.env.ARCH = (process.env.ARCH || process.arch) === 'arm' ? 'armv7l' : process.env.ARCH || process.arch

execFileSync('npm', ['run', 'build'], { stdio: 'inherit', cwd: projectRoot })

const builtinPluginsPath = path.resolve(__dirname, '../builtin-plugins')
if (fs.existsSync(builtinPluginsPath)) {
    fs.rmSync(builtinPluginsPath, { recursive: true, force: true })
}
execFileSync(process.execPath, [path.join(__dirname, 'prepackage-plugins.mjs')], { stdio: 'inherit' })

const hasPatchelf = () => {
    try {
        execFileSync('patchelf', ['--version'], { stdio: 'ignore' })
        return true
    } catch {
        return false
    }
}

const findLibfuse2 = () => {
    const candidates = [
        '/usr/lib/x86_64-linux-gnu/libfuse.so.2',
        '/lib/x86_64-linux-gnu/libfuse.so.2',
        '/usr/lib64/libfuse.so.2',
        '/usr/lib/libfuse.so.2',
        '/lib/libfuse.so.2',
    ]

    try {
        const out = execFileSync('ldconfig', ['-p'], { encoding: 'utf8' })
        const match = out.match(/libfuse\.so\.2\s+.*=>\s*(\S+)/)
        if (match?.[1] && fs.existsSync(match[1])) {
            return fs.realpathSync(match[1])
        }
    } catch {
    }

    for (const c of candidates) {
        if (fs.existsSync(c)) {
            return fs.realpathSync(c)
        }
    }

    return null
}

const findPreferredLibfuse2 = (projectRoot) => {
    const system = findLibfuse2()
    const localPrimaryCandidates = [
        path.join(projectRoot, 'libfuse.so.2'),
        path.join(projectRoot, 'libfuse.so.2.custom'),
    ]

    let primary = null
    for (const c of localPrimaryCandidates) {
        if (fs.existsSync(c)) {
            primary = fs.realpathSync(c)
            break
        }
    }

    if (!primary) {
        primary = system
    }

    if (!primary) {
        return null
    }

    return {
        primary,
        system: (system && system !== primary) ? system : null,
    }
}

const findAppImages = rootDir => {
    const appImages = []
    const stack = [rootDir]
    while (stack.length) {
        const dir = stack.pop()
        if (!dir) {
            continue
        }
        let entries
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true })
        } catch {
            continue
        }
        for (const entry of entries) {
            const full = path.join(dir, entry.name)
            if (entry.isDirectory()) {
                stack.push(full)
            } else if (entry.isFile() && entry.name.endsWith('.AppImage')) {
                appImages.push(full)
            }
        }
    }
    return appImages
}

const bundleLibfuse2ForAppImage = () => {
    const distDir = path.join(projectRoot, 'dist')
    if (!fs.existsSync(distDir)) {
        return
    }

    const appImages = findAppImages(distDir)
    if (!appImages.length) {
        return
    }

    const libfuseInfo = findPreferredLibfuse2(projectRoot)
    if (!libfuseInfo?.primary) {
        console.warn('libfuse.so.2 not found on this system, skipping AppImage libfuse2 bundling')
        return
    }

    const canPatch = hasPatchelf()
    for (const appImagePath of appImages) {
        const outDir = path.dirname(appImagePath)
        const destLibPath = path.join(outDir, 'libfuse.so.2')
        try {
            fs.copyFileSync(libfuseInfo.primary, destLibPath)
        } catch (e) {
            console.warn(`Failed to copy libfuse.so.2 next to ${appImagePath}:`, e)
        }

        const wrapperPath = path.join(outDir, `run-${path.basename(appImagePath)}.sh`)
        try {
            fs.writeFileSync(wrapperPath, `#!/bin/sh
set -e
DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
APPIMAGE="$DIR/${path.basename(appImagePath)}"
HAS_SYSTEM_FUSE=0
if command -v ldconfig >/dev/null 2>&1; then
  if ldconfig -p 2>/dev/null | grep -q "libfuse.so.2"; then
    HAS_SYSTEM_FUSE=1
  fi
fi
if [ "$HAS_SYSTEM_FUSE" -eq 0 ]; then
  for p in /usr/lib/x86_64-linux-gnu/libfuse.so.2 /lib/x86_64-linux-gnu/libfuse.so.2 /usr/lib64/libfuse.so.2 /usr/lib/libfuse.so.2 /lib/libfuse.so.2; do
    if [ -f "$p" ]; then
      HAS_SYSTEM_FUSE=1
      break
    fi
  done
fi
if [ "$HAS_SYSTEM_FUSE" -eq 0 ] && [ -f "$DIR/libfuse.so.2" ]; then
  export LD_LIBRARY_PATH="$DIR\${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
  export APPIMAGE_FUSE_LIBRARY="$DIR/libfuse.so.2"
fi
export ELECTRON_DISABLE_SANDBOX=1
exec "$APPIMAGE" --no-sandbox --disable-dev-shm-usage --disable-gpu "$@"
`)
            fs.chmodSync(wrapperPath, 0o755)
        } catch (e) {
            console.warn(`Failed to create AppImage wrapper ${wrapperPath}:`, e)
        }

        if (canPatch) {
            try {
                execFileSync('patchelf', ['--set-rpath', '$ORIGIN', appImagePath], { stdio: 'ignore' })
            } catch (e) {
                console.warn(`Failed to set RPATH on ${appImagePath}:`, e)
            }
        } else {
            console.warn('patchelf not found, skipping AppImage RPATH patching')
        }
    }
}

builder({
    dir: true,
    linux: ['deb', 'rpm', 'AppImage'],
    armv7l: process.env.ARCH === 'armv7l',
    arm64: process.env.ARCH === 'arm64',
    config: {
        npmRebuild: false,
        afterPack: async context => {
            const platform = context.electronPlatformName ?? context.packager?.platform?.nodeName
            if (platform !== 'linux') {
                return
            }

            const appOutDir = context.appOutDir
            const exeName = 'tabshell'
            const exePath = path.join(appOutDir, exeName)
            const realExePath = path.join(appOutDir, `${exeName}-bin`)

            if (!fs.existsSync(exePath)) {
                return
            }
            if (fs.existsSync(realExePath)) {
                return
            }

            const stat = fs.statSync(exePath)
            if (!stat.isFile()) {
                return
            }

            const fd = fs.openSync(exePath, 'r')
            const header = Buffer.alloc(4)
            fs.readSync(fd, header, 0, 4, 0)
            fs.closeSync(fd)
            const isElf = header[0] === 0x7f && header[1] === 0x45 && header[2] === 0x4c && header[3] === 0x46
            if (!isElf) {
                return
            }

            const libfuseInfo = findPreferredLibfuse2(projectRoot)
            if (libfuseInfo?.primary) {
                try {
                    fs.copyFileSync(libfuseInfo.primary, path.join(appOutDir, 'libfuse.so.2'))
                } catch {
                }
            }
            fs.renameSync(exePath, realExePath)
            fs.writeFileSync(exePath, `#!/bin/sh
DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
HAS_SYSTEM_FUSE=0
if command -v ldconfig >/dev/null 2>&1; then
  if ldconfig -p 2>/dev/null | grep -q "libfuse.so.2"; then
    HAS_SYSTEM_FUSE=1
  fi
fi
if [ "$HAS_SYSTEM_FUSE" -eq 0 ]; then
  for p in /usr/lib/x86_64-linux-gnu/libfuse.so.2 /lib/x86_64-linux-gnu/libfuse.so.2 /usr/lib64/libfuse.so.2 /usr/lib/libfuse.so.2 /lib/libfuse.so.2; do
    if [ -f "$p" ]; then
      HAS_SYSTEM_FUSE=1
      break
    fi
  done
fi
export ELECTRON_DISABLE_SANDBOX=1
export LD_LIBRARY_PATH="$DIR\${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
if [ "$HAS_SYSTEM_FUSE" -eq 0 ] && [ -f "$DIR/libfuse.so.2" ]; then
export APPIMAGE_FUSE_LIBRARY="$DIR/libfuse.so.2"
fi
if [ -x "/opt/TabShell/${exeName}-bin" ]; then
exec "/opt/TabShell/${exeName}-bin" --no-sandbox --disable-dev-shm-usage --disable-gpu "$@"
else
exec "$DIR/${exeName}-bin" --no-sandbox --disable-dev-shm-usage --disable-gpu "$@"
fi
`)
            fs.chmodSync(exePath, 0o755)

            const chromeSandboxPath = path.join(appOutDir, 'chrome-sandbox')
            if (fs.existsSync(chromeSandboxPath)) {
                try {
                    fs.chmodSync(chromeSandboxPath, 0o4755)
                } catch { }
            }
        },
        extraMetadata: {
            version: vars.version,
        },
        publish: process.env.KEYGEN_TOKEN ? [
            vars.keygenConfig,
            {
                provider: 'github',
                channel: `latest-${process.env.ARCH}`,
            },
        ] : undefined,
    },
    publish: (process.env.KEYGEN_TOKEN && isTag) ? 'always' : 'never',
}).then(() => {
    bundleLibfuse2ForAppImage()
}).catch(e => {
    console.error(e)
    process.exit(1)
})
