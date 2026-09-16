# Must execute after initMultiUser resolves $INSTDIR, before the old uninstaller.
# Assisted installs can change directory after customInit and require a new hook.
!ifndef ONE_CLICK
  !error "PuPu sidecar preflight requires the one-click installer contract"
!endif
!define PUPU_INSTALLER_SOURCE_DIR "${__FILEDIR__}"

!macro customInit
  InitPluginsDir
  File "/oname=$PLUGINSDIR\stop-installed-sidecars.ps1" "${PUPU_INSTALLER_SOURCE_DIR}\stop-installed-sidecars.ps1"
  File "/oname=$PLUGINSDIR\sidecar-cleanup.cs" "${PUPU_INSTALLER_SOURCE_DIR}\sidecar-cleanup.cs"
  Push $0
  Push $1
  nsExec::ExecToStack /TIMEOUT=45000 '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\stop-installed-sidecars.ps1" -InstallDirectory "$INSTDIR"'
  Pop $0
  Pop $1
  ${If} $0 != 0
    DetailPrint "PuPu sidecar preflight failed ($0): $1. Close PuPu and retry. No application files were replaced."
    SetErrorLevel 2
    Quit
  ${EndIf}
  DetailPrint "$1"
  Pop $1
  Pop $0
!macroend
