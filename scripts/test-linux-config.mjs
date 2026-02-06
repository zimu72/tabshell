#!/usr/bin/env node
/**
 * Property-based tests for Linux package configuration
 * 
 * Property 2: DEB Package Declares All Required Dependencies
 * Property 3: RPM Package Declares All Required Dependencies
 * Property 6: executableArgs Configuration
 * 
 * Validates: Requirements 2.1-2.19, 3.1-3.19, 6.1-6.3
 */

import fs from 'node:fs'
import path from 'node:path'
import * as url from 'url'
import yaml from 'js-yaml'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

// Required startup parameters
const REQUIRED_EXECUTABLE_ARGS = [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu'
]

// Required DEB dependencies (Requirements 2.1-2.19)
const REQUIRED_DEB_DEPENDS = [
    'libnotify4',
    'libsecret-1-0',
    'libxtst6',
    'libnss3',
    'libgtk-3-0',
    'libxss1',
    'xdg-utils',
    'libatspi2.0-0',
    'libuuid1',
    'gnome-keyring',
    'libasound2',
    'libgbm1',
    'libdrm2',
    'libxkbcommon0',
    'libxrandr2',
    'libxcomposite1',
    'libxdamage1',
    'libxfixes3',
    'libcups2'
]

// Required RPM dependencies (Requirements 3.1-3.19)
const REQUIRED_RPM_DEPENDS = [
    'gnome-keyring',
    'libsecret',
    'libnotify',
    'libXtst',
    'nss',
    'gtk3',
    'libXScrnSaver',
    'xdg-utils',
    'at-spi2-atk',
    'libuuid',
    'alsa-lib',
    'mesa-libgbm',
    'libdrm',
    'libxkbcommon',
    'libXrandr',
    'libXcomposite',
    'libXdamage',
    'libXfixes',
    'cups-libs'
]

let testsPassed = 0
let testsFailed = 0

function test(name, fn) {
    try {
        fn()
        console.log(`✓ ${name}`)
        testsPassed++
    } catch (e) {
        console.error(`✗ ${name}`)
        console.error(`  Error: ${e.message}`)
        testsFailed++
    }
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message)
    }
}

function assertArrayContains(arr, items, context) {
    const missing = items.filter(item => !arr.includes(item))
    if (missing.length > 0) {
        throw new Error(`${context} missing: ${missing.join(', ')}`)
    }
}

// Load and parse electron-builder.yml
const configPath = path.join(projectRoot, 'electron-builder.yml')
const configContent = fs.readFileSync(configPath, 'utf8')
const config = yaml.load(configContent)

console.log('=== Linux Package Configuration Tests ===\n')

// Property 6: executableArgs Configuration
// For any electron-builder.yml configuration, the linux.executableArgs array 
// SHALL contain all three required startup parameters.
console.log('Property 6: executableArgs Configuration')
console.log('Validates: Requirements 6.1, 6.2, 6.3\n')

test('linux.executableArgs exists and is an array', () => {
    assert(config.linux, 'linux section not found')
    assert(Array.isArray(config.linux.executableArgs), 'executableArgs is not an array')
})

test('executableArgs contains --no-sandbox', () => {
    assert(config.linux.executableArgs.includes('--no-sandbox'), 
        'Missing --no-sandbox parameter')
})

test('executableArgs contains --disable-dev-shm-usage', () => {
    assert(config.linux.executableArgs.includes('--disable-dev-shm-usage'), 
        'Missing --disable-dev-shm-usage parameter')
})

test('executableArgs contains --disable-gpu', () => {
    assert(config.linux.executableArgs.includes('--disable-gpu'), 
        'Missing --disable-gpu parameter')
})

test('executableArgs contains all required parameters', () => {
    assertArrayContains(config.linux.executableArgs, REQUIRED_EXECUTABLE_ARGS, 'executableArgs')
})

console.log('')

// Property 2: DEB Package Declares All Required Dependencies
// For any DEB package configuration, the depends array SHALL contain 
// all 19 required dependencies as specified in the requirements.
console.log('Property 2: DEB Package Declares All Required Dependencies')
console.log('Validates: Requirements 2.1-2.19\n')

test('deb.depends exists and is an array', () => {
    assert(config.deb, 'deb section not found')
    assert(Array.isArray(config.deb.depends), 'deb.depends is not an array')
})

test('deb.depends contains all 19 required dependencies', () => {
    assertArrayContains(config.deb.depends, REQUIRED_DEB_DEPENDS, 'DEB depends')
})

// Test each DEB dependency individually
REQUIRED_DEB_DEPENDS.forEach((dep, index) => {
    test(`deb.depends contains ${dep} (Requirement 2.${index + 1})`, () => {
        assert(config.deb.depends.includes(dep), `Missing dependency: ${dep}`)
    })
})

console.log('')

// Property 3: RPM Package Declares All Required Dependencies
// For any RPM package configuration, the depends array SHALL contain 
// all 19 required dependencies as specified in the requirements.
console.log('Property 3: RPM Package Declares All Required Dependencies')
console.log('Validates: Requirements 3.1-3.19\n')

test('rpm.depends exists and is an array', () => {
    assert(config.rpm, 'rpm section not found')
    assert(Array.isArray(config.rpm.depends), 'rpm.depends is not an array')
})

test('rpm.depends contains all 19 required dependencies', () => {
    assertArrayContains(config.rpm.depends, REQUIRED_RPM_DEPENDS, 'RPM depends')
})

// Test each RPM dependency individually
REQUIRED_RPM_DEPENDS.forEach((dep, index) => {
    test(`rpm.depends contains ${dep} (Requirement 3.${index + 1})`, () => {
        assert(config.rpm.depends.includes(dep), `Missing dependency: ${dep}`)
    })
})

console.log('')
console.log('=== Test Summary ===')
console.log(`Passed: ${testsPassed}`)
console.log(`Failed: ${testsFailed}`)
console.log('')

if (testsFailed > 0) {
    process.exit(1)
}
