!macro customInit
  nsExec::Exec '"$LOCALAPPDATA\tabby\Update.exe" --uninstall -s'
!macroend

!macro customInstall
  StrCpy $0 "TabShell"

  IfFileExists "$DESKTOP\$0.lnk" 0 +3
    Delete "$DESKTOP\$0.lnk"
    CreateShortCut "$DESKTOP\$0.lnk" "$INSTDIR\$0.exe" "" "$INSTDIR\resources\tabshell_icon.ico" 0

  IfFileExists "$SMPROGRAMS\$0.lnk" 0 +3
    Delete "$SMPROGRAMS\$0.lnk"
    CreateShortCut "$SMPROGRAMS\$0.lnk" "$INSTDIR\$0.exe" "" "$INSTDIR\resources\tabshell_icon.ico" 0

  IfFileExists "$SMPROGRAMS\$0\$0.lnk" 0 +3
    Delete "$SMPROGRAMS\$0\$0.lnk"
    CreateShortCut "$SMPROGRAMS\$0\$0.lnk" "$INSTDIR\$0.exe" "" "$INSTDIR\resources\tabshell_icon.ico" 0
!macroend
