#!/usr/bin/env node
import sh from 'shelljs'
import * as vars from './vars.mjs'
import log from 'npmlog'
import path from 'path'

const tsc = path.resolve('node_modules/typescript/lib/tsc.js')
const node = process.execPath
sh.config.execPath = node

vars.builtinPlugins.forEach(plugin => {
    log.info('typings', plugin)
    const cmd = `"${node}" "${tsc}" --project ${plugin}/tsconfig.typings.json`
    if (sh.exec(cmd).code !== 0) {
        process.exit(1)
    }
})
