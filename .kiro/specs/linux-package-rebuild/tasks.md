# Implementation Plan: Linux Package Rebuild

## Overview

本实现计划将重构 TabShell 的 Linux 包构建配置，确保所有依赖项完整包含，并且启动参数与 `npm start` 一致。

## Tasks

- [x] 1. 更新 electron-builder.yml 配置
  - [x] 1.1 更新 linux.executableArgs 添加启动参数
    - 添加 `--no-sandbox`、`--disable-dev-shm-usage`、`--disable-gpu`
    - _Requirements: 1.1, 1.2, 1.3, 6.1, 6.2, 6.3_
  - [x] 1.2 更新 DEB 包依赖配置
    - 添加所有 19 个必需依赖项
    - _Requirements: 2.1-2.19_
  - [x] 1.3 更新 RPM 包依赖配置
    - 添加所有 19 个必需依赖项
    - _Requirements: 3.1-3.19_
  - [x] 1.4 编写配置验证属性测试
    - **Property 2: DEB Package Declares All Required Dependencies**
    - **Property 3: RPM Package Declares All Required Dependencies**
    - **Property 6: executableArgs Configuration**
    - **Validates: Requirements 2.1-2.19, 3.1-3.19, 6.1-6.3**

- [x] 2. 更新 after-install.tpl 脚本
  - [x] 2.1 修改启动器脚本模板
    - 添加 `--disable-dev-shm-usage` 和 `--disable-gpu` 参数
    - 使用 `exec` 替换当前进程
    - 使用 `"$@"` 正确传递用户参数
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
  - [x] 2.2 编写 after-install 脚本属性测试
    - **Property 1: Launcher Configuration Contains Required Parameters**
    - **Property 5: After-Install Script Parameter Passthrough**
    - **Validates: Requirements 1.1-1.3, 5.2-5.5**

- [x] 3. 更新 build-linux.mjs 构建脚本
  - [x] 3.1 更新 afterPack 钩子中的启动脚本
    - 添加 `--disable-dev-shm-usage` 和 `--disable-gpu` 参数
    - _Requirements: 1.1, 1.2, 1.3_
  - [x] 3.2 更新 AppImage wrapper 脚本
    - 添加环境变量 `ELECTRON_DISABLE_SANDBOX=1`
    - 添加所有三个启动参数
    - _Requirements: 4.2, 4.3, 4.4_
  - [x] 3.3 添加 RPM 到构建目标
    - 修改 builder 调用，添加 'rpm' 到 linux 数组
    - _Requirements: 7.1, 7.2, 7.3_
  - [x] 3.4 编写 AppImage wrapper 属性测试
    - **Property 4: AppImage Wrapper Script Configuration**
    - **Validates: Requirements 4.2, 4.3, 4.4**

- [x] 4. Checkpoint - 验证配置更改
  - 确保所有配置文件语法正确
  - 确保所有测试通过，如有问题请询问用户

- [x] 5. 集成验证
  - [x] 5.1 验证 electron-builder.yml 语法
    - 使用 YAML 解析验证配置文件
    - _Requirements: 1.1-1.3, 2.1-2.19, 3.1-3.19, 6.1-6.3_
  - [x] 5.2 验证 shell 脚本语法
    - 检查 after-install.tpl 和生成的脚本语法
    - _Requirements: 5.1-5.5_

- [x] 6. Final Checkpoint - 确保所有测试通过
  - 确保所有测试通过，如有问题请询问用户

## Verification Summary

All implementation tasks have been completed and verified:

- **electron-builder.yml**: Contains all 19 DEB dependencies, all 19 RPM dependencies, and all 3 executableArgs
- **build/linux/after-install.tpl**: Contains all required startup parameters with proper argument passthrough
- **scripts/build-linux.mjs**: AppImage wrapper and afterPack launcher both configured correctly with all parameters
- **Test Results**: All 75 tests pass (47 config tests + 12 after-install tests + 16 build-linux tests)

## Notes

- All tasks are required for comprehensive testing
- 本实现使用 JavaScript 进行属性测试（scripts/test-*.mjs）
- 所有配置更改都是对现有文件的修改，不需要创建新的核心文件
- 测试脚本验证配置文件内容而非模拟文件系统操作
