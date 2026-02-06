# Requirements Document

## Introduction

本规范定义了重构 TabShell 应用的 Linux 包（RPM、DEB、AppImage）构建配置的需求。目标是确保所有依赖项完整包含，并且构建后的软件包启动方式与 `npm start` 命令的参数保持一致。

当前 `npm start` 命令为：
```bash
cross-env TABBY_DEV=1 electron app --disable-dev-shm-usage --no-sandbox --disable-gpu
```

生产环境需要的关键启动参数：
- `--no-sandbox` - 禁用 Chromium 沙箱（已在现有配置中）
- `--disable-dev-shm-usage` - 禁用 /dev/shm 使用，避免共享内存问题
- `--disable-gpu` - 禁用 GPU 加速，提高兼容性

## Glossary

- **Build_System**: electron-builder 构建系统，负责生成 Linux 安装包
- **DEB_Package**: Debian/Ubuntu 系统的 .deb 安装包
- **RPM_Package**: Red Hat/Fedora/CentOS 系统的 .rpm 安装包
- **AppImage**: 便携式 Linux 应用格式，无需安装即可运行
- **Launcher_Script**: 启动脚本，用于设置环境变量和启动参数
- **Dependency_Manager**: 包管理器依赖配置，确保运行时依赖正确安装

## Requirements

### Requirement 1: 统一启动参数配置

**User Story:** 作为用户，我希望安装后的应用启动参数与开发环境一致，以确保应用在各种 Linux 环境下稳定运行。

#### Acceptance Criteria

1. THE Build_System SHALL configure all Linux packages to launch with `--no-sandbox` parameter
2. THE Build_System SHALL configure all Linux packages to launch with `--disable-dev-shm-usage` parameter
3. THE Build_System SHALL configure all Linux packages to launch with `--disable-gpu` parameter
4. WHEN the application is launched via desktop entry THEN the Launcher_Script SHALL pass all required parameters to the Electron binary

### Requirement 2: DEB 包依赖完整性

**User Story:** 作为 Debian/Ubuntu 用户，我希望安装 DEB 包时自动安装所有必需的依赖，以确保应用正常运行。

#### Acceptance Criteria

1. THE DEB_Package SHALL declare libnotify4 as a dependency
2. THE DEB_Package SHALL declare libsecret-1-0 as a dependency
3. THE DEB_Package SHALL declare libxtst6 as a dependency
4. THE DEB_Package SHALL declare libnss3 as a dependency
5. THE DEB_Package SHALL declare libgtk-3-0 as a dependency
6. THE DEB_Package SHALL declare libxss1 as a dependency
7. THE DEB_Package SHALL declare xdg-utils as a dependency
8. THE DEB_Package SHALL declare libatspi2.0-0 as a dependency
9. THE DEB_Package SHALL declare libuuid1 as a dependency
10. THE DEB_Package SHALL declare gnome-keyring as a dependency
11. THE DEB_Package SHALL declare libasound2 as a dependency for audio support
12. THE DEB_Package SHALL declare libgbm1 as a dependency for GPU buffer management
13. THE DEB_Package SHALL declare libdrm2 as a dependency for Direct Rendering Manager
14. THE DEB_Package SHALL declare libxkbcommon0 as a dependency for keyboard handling
15. THE DEB_Package SHALL declare libxrandr2 as a dependency for display configuration
16. THE DEB_Package SHALL declare libxcomposite1 as a dependency for compositing
17. THE DEB_Package SHALL declare libxdamage1 as a dependency for damage tracking
18. THE DEB_Package SHALL declare libxfixes3 as a dependency for X fixes extension
19. THE DEB_Package SHALL declare libcups2 as a dependency for printing support

### Requirement 3: RPM 包依赖完整性

**User Story:** 作为 Red Hat/Fedora/CentOS 用户，我希望安装 RPM 包时自动安装所有必需的依赖，以确保应用正常运行。

#### Acceptance Criteria

1. THE RPM_Package SHALL declare gnome-keyring as a dependency
2. THE RPM_Package SHALL declare libsecret as a dependency
3. THE RPM_Package SHALL declare libnotify as a dependency
4. THE RPM_Package SHALL declare libXtst as a dependency
5. THE RPM_Package SHALL declare nss as a dependency
6. THE RPM_Package SHALL declare gtk3 as a dependency
7. THE RPM_Package SHALL declare libXScrnSaver as a dependency
8. THE RPM_Package SHALL declare xdg-utils as a dependency
9. THE RPM_Package SHALL declare at-spi2-atk as a dependency
10. THE RPM_Package SHALL declare libuuid as a dependency
11. THE RPM_Package SHALL declare alsa-lib as a dependency for audio support
12. THE RPM_Package SHALL declare mesa-libgbm as a dependency for GPU buffer management
13. THE RPM_Package SHALL declare libdrm as a dependency for Direct Rendering Manager
14. THE RPM_Package SHALL declare libxkbcommon as a dependency for keyboard handling
15. THE RPM_Package SHALL declare libXrandr as a dependency for display configuration
16. THE RPM_Package SHALL declare libXcomposite as a dependency for compositing
17. THE RPM_Package SHALL declare libXdamage as a dependency for damage tracking
18. THE RPM_Package SHALL declare libXfixes as a dependency for X fixes extension
19. THE RPM_Package SHALL declare cups-libs as a dependency for printing support

### Requirement 4: AppImage 自包含依赖

**User Story:** 作为使用 AppImage 的用户，我希望 AppImage 包含所有必要的库文件，以便在各种 Linux 发行版上无需额外安装依赖即可运行。

#### Acceptance Criteria

1. THE AppImage SHALL bundle libfuse.so.2 for FUSE filesystem support
2. THE AppImage SHALL include a wrapper script that sets LD_LIBRARY_PATH correctly
3. THE AppImage SHALL set ELECTRON_DISABLE_SANDBOX=1 environment variable
4. WHEN the AppImage is executed THEN the Launcher_Script SHALL pass `--no-sandbox`, `--disable-dev-shm-usage`, and `--disable-gpu` parameters
5. THE AppImage SHALL use patchelf to set RPATH to $ORIGIN when available

### Requirement 5: 安装后脚本配置

**User Story:** 作为系统管理员，我希望安装后脚本正确配置应用启动器，以确保用户可以从命令行和桌面环境正常启动应用。

#### Acceptance Criteria

1. WHEN the DEB package is installed THEN the after-install script SHALL create a launcher script at /usr/bin/tabshell
2. THE Launcher_Script SHALL include `--no-sandbox` parameter
3. THE Launcher_Script SHALL include `--disable-dev-shm-usage` parameter
4. THE Launcher_Script SHALL include `--disable-gpu` parameter
5. THE Launcher_Script SHALL pass all user-provided arguments to the application

### Requirement 6: Desktop Entry 配置

**User Story:** 作为桌面用户，我希望从应用菜单启动应用时使用正确的参数，以确保应用稳定运行。

#### Acceptance Criteria

1. THE Build_System SHALL configure executableArgs in electron-builder.yml to include `--no-sandbox`
2. THE Build_System SHALL configure executableArgs in electron-builder.yml to include `--disable-dev-shm-usage`
3. THE Build_System SHALL configure executableArgs in electron-builder.yml to include `--disable-gpu`

### Requirement 7: 构建脚本增强

**User Story:** 作为开发者，我希望构建脚本能够生成所有三种 Linux 包格式（DEB、RPM、AppImage），以便为不同的 Linux 发行版提供安装选项。

#### Acceptance Criteria

1. THE Build_System SHALL generate DEB packages for Debian-based distributions
2. THE Build_System SHALL generate RPM packages for Red Hat-based distributions
3. THE Build_System SHALL generate AppImage packages for portable distribution
4. WHEN the build completes THEN the Build_System SHALL output all three package formats to the dist directory
