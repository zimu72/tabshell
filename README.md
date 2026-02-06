# TabShell - Practical Terminal Enhancement Based on Tabby

> Personal terminal tool built on Tabby to solve multi-session management pain points. Shared for community use. No fluff, just features.

## 📌 Core New Features

### 🔌 Session Management (Left Panel)
* Tree-structured session organization (unlimited folder levels)
* Drag-and-drop reordering/movement
* Context menu:
  * New Session (SSH only in sidebar)
  * New Folder
  * Edit/Copy/Delete
  * Quick Connect
  * Open in New Tab
* Top search bar for real-time filtering
* Session configuration import/export (JSON format, local storage)

### ✍️ Command Input Panel (Fixed Bottom Area)
* **Two Input Modes**:
  * `Real-time Input`: Character-level sync to selected sessions (special characters auto-escaped)
  * `Batch Input`: Execute on Enter (supports command separation with `;` or newlines)
* **Tab Session Switch**:
  * Location: Replaces original useless hyphen button in tab title
  * States: 🔊 Enabled (green) / 🔇 Disabled (gray)
  * Function: Controls whether the tab receives input commands
  * Default: Enabled for new tabs
* **Batch Operation Buttons**:
  * ⚡ Enable All
  * 🚫 Disable All
  * 📌 Current Only
  * 🔄 Toggle Selection
* Status bar shows: `Sending to X/Y sessions`
* Command history + auto-complete + syntax highlighting
* Friendly提示 when no active sessions/all disabled

### 📤 File Transfer
* Retains Tabby's native SFTP browser (local+remote)
* New SFTP jump function:
  * Support opening current connection via FileZilla/TabFTP (custom FileZilla client)
  * Single instance multi-terminal management

### 🔒 Compatibility
* Built on Tabby 1.0.170+
* Fully retains Tabby's original features (SSH/Telnet/Serial/themes/plugins)
* Supports Windows / Linux

## 💡 Usage Notes
* Automatically imports existing Tabby configuration on first launch
* Configuration file location: `~/.config/tablishell/`
* Open source project, welcome to modify as needed

> No commercial use, no data collection, pure local tool  
> Feedback: GitHub Issue section 😄