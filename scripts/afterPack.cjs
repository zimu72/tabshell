const fs = require('fs');
const path = require('path');

// 保守的排除规则 - 只排除100%确定不需要的

// 可安全删除的目录名
const EXCLUDE_DIRS = new Set([
    'test', 'tests', '__tests__', '__mocks__',
    'example', 'examples', 
    'doc', 'docs', 'documentation',
    '.github', '.vscode', '.idea',
    'coverage', '.nyc_output',
    'benchmark', 'benchmarks',
]);

// 可安全删除的文件扩展名
const EXCLUDE_EXTENSIONS = new Set([
    '.md', '.markdown',           // 文档
    '.ts',                        // TypeScript源码（编译后的js才需要）
    '.map',                       // source map
    '.obj', '.o',                 // 编译中间文件
    '.tlog', '.log',              // 日志文件
    '.cc', '.cpp', '.c', '.h', '.hpp', '.gyp', '.gypi',  // C/C++源码和构建文件
    '.py', '.pyc',                // Python文件
    '.eslintrc', '.prettierrc', '.editorconfig', '.nycrc', '.babelrc',  // 配置文件
    '.travis.yml', '.gitlab-ci.yml', 'appveyor.yml',  // CI配置
    '.npmignore', '.gitignore', '.gitattributes',     // git/npm配置
]);

// 可安全删除的文件名
const EXCLUDE_FILES = new Set([
    'README', 'README.md', 'readme.md', 'Readme.md',
    'CHANGELOG', 'CHANGELOG.md', 'changelog.md', 'HISTORY.md',
    'LICENSE', 'LICENSE.md', 'license', 'license.md', 'LICENSE.txt', 'LICENSE-MIT.txt',
    'CONTRIBUTING.md', 'CONTRIBUTORS.md', 'AUTHORS', 'AUTHORS.md',
    'Makefile', 'Gruntfile.js', 'Gulpfile.js',
    'karma.conf.js', 'jest.config.js',
    'tsconfig.json', 'tslint.json', 'jsconfig.json',
    '.npmrc', '.yarnrc',
    'bower.json', 'component.json',
    '.DS_Store', 'Thumbs.db',
    'binding.gyp',
    '.travis.yml', '.gitlab-ci.yml', 'appveyor.yml',
    'yarn.lock',  // 锁文件不需要
]);

exports.default = async function(context) {
    const appOutDir = context.appOutDir;
    const resourcesDir = path.join(appOutDir, 'resources', 'app');
    const sourceNodeModules = path.join(__dirname, '..', 'app', 'node_modules');
    const targetNodeModules = path.join(resourcesDir, 'node_modules');

    console.log('afterPack: Copying node_modules (conservative optimization)...');
    console.log('  Source:', sourceNodeModules);
    console.log('  Target:', targetNodeModules);

    let stats = { copied: 0, skippedFiles: 0, skippedDirs: 0, savedBytes: 0 };

    if (fs.existsSync(sourceNodeModules)) {
        copyFolderOptimized(sourceNodeModules, targetNodeModules, stats);
        console.log(`afterPack: Done!`);
        console.log(`  Copied: ${stats.copied} files`);
        console.log(`  Skipped: ${stats.skippedFiles} files, ${stats.skippedDirs} directories`);
        console.log(`  Saved: ${Math.round(stats.savedBytes/1024/1024)} MB`);
    } else {
        console.error('afterPack: Source node_modules not found!');
    }
};

function shouldExcludeDir(name) {
    return EXCLUDE_DIRS.has(name);
}

function shouldExcludeFile(name) {
    if (EXCLUDE_FILES.has(name)) return true;
    
    const ext = path.extname(name).toLowerCase();
    if (EXCLUDE_EXTENSIONS.has(ext)) return true;
    
    // 特殊处理：排除 .d.ts 文件
    if (name.endsWith('.d.ts')) return true;
    
    return false;
}

function copyFolderOptimized(source, target, stats) {
    if (!fs.existsSync(target)) {
        fs.mkdirSync(target, { recursive: true });
    }

    let files;
    try {
        files = fs.readdirSync(source);
    } catch (e) {
        return;
    }

    for (const file of files) {
        const sourcePath = path.join(source, file);
        const targetPath = path.join(target, file);
        
        let stat;
        try {
            stat = fs.lstatSync(sourcePath);
        } catch (e) {
            continue;
        }

        if (stat.isSymbolicLink()) {
            continue;
        }
        
        if (stat.isDirectory()) {
            if (shouldExcludeDir(file)) {
                stats.skippedDirs++;
                continue;
            }
            copyFolderOptimized(sourcePath, targetPath, stats);
        } else {
            if (shouldExcludeFile(file)) {
                stats.skippedFiles++;
                stats.savedBytes += stat.size;
                continue;
            }
            try {
                fs.copyFileSync(sourcePath, targetPath);
                stats.copied++;
            } catch (e) {
                // 忽略复制错误
            }
        }
    }
}
