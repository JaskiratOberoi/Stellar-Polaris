; Custom NSIS hooks for Stellar Polaris (included by electron-builder assisted installer).
; Vars must be file-scope so Functions compile before `customHeader` is expanded.

!include "LogicLib.nsh"
!include "nsDialogs.nsh"

Var STELLAR_LOGS_DIR
Var STELLAR_DATA_DIR
Var StellarDlg
Var StellarLogsEdit
Var StellarDataEdit
Var StellarBrowseLogsBtn
Var StellarBrowseDataBtn
Var StellarFolderPick

!macro preInit
  StrCpy $STELLAR_LOGS_DIR "$LOCALAPPDATA\Stellar Polaris\logs"
  StrCpy $STELLAR_DATA_DIR "$LOCALAPPDATA\Stellar Polaris\data"

  ReadRegStr $R9 HKCU "Software\Stellar Polaris" "LogsDir"
  ${If} $R9 != ""
    StrCpy $STELLAR_LOGS_DIR $R9
  ${EndIf}

  ReadRegStr $R9 HKCU "Software\Stellar Polaris" "DataDir"
  ${If} $R9 != ""
    StrCpy $STELLAR_DATA_DIR $R9
  ${EndIf}
!macroend

Function StellarBrowseLogs
  nsDialogs::SelectFolderDialog $STELLAR_LOGS_DIR "Select folder for audit logs"
  Pop $StellarFolderPick
  StrCmp $StellarFolderPick error done
  ${NSD_SetText} $StellarLogsEdit $StellarFolderPick
done:
FunctionEnd

Function StellarBrowseData
  nsDialogs::SelectFolderDialog $STELLAR_DATA_DIR "Select folder for app data (scheduler, etc.)"
  Pop $StellarFolderPick
  StrCmp $StellarFolderPick error done
  ${NSD_SetText} $StellarDataEdit $StellarFolderPick
done:
FunctionEnd

Function StellarLogsPage
  nsDialogs::Create 1018
  Pop $StellarDlg
  ${If} $StellarDlg == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 24u "Audit logs folder (CSV, JSONL, run logs). Previous install paths are pre-filled when upgrading."
  Pop $0

  ${NSD_CreateText} 0 28u 70% 12u "$STELLAR_LOGS_DIR"
  Pop $StellarLogsEdit

  ${NSD_CreateButton} 72% 27u 28% 15u "Browse..."
  Pop $StellarBrowseLogsBtn
  ${NSD_OnClick} $StellarBrowseLogsBtn StellarBrowseLogs

  nsDialogs::Show
FunctionEnd

Function StellarLogsLeave
  ${NSD_GetText} $StellarLogsEdit $STELLAR_LOGS_DIR
  ${If} $STELLAR_LOGS_DIR == ""
    MessageBox mb_IconStop|mb_TopMost "Please enter or browse to a logs folder."
    Abort
  ${EndIf}
FunctionEnd

Function StellarDataPage
  nsDialogs::Create 1018
  Pop $StellarDlg
  ${If} $StellarDlg == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 24u "App data folder (scheduler.json and related state)."
  Pop $0

  ${NSD_CreateText} 0 28u 70% 12u "$STELLAR_DATA_DIR"
  Pop $StellarDataEdit

  ${NSD_CreateButton} 72% 27u 28% 15u "Browse..."
  Pop $StellarBrowseDataBtn
  ${NSD_OnClick} $StellarBrowseDataBtn StellarBrowseData

  nsDialogs::Show
FunctionEnd

Function StellarDataLeave
  ${NSD_GetText} $StellarDataEdit $STELLAR_DATA_DIR
  ${If} $STELLAR_DATA_DIR == ""
    MessageBox mb_IconStop|mb_TopMost "Please enter or browse to a data folder."
    Abort
  ${EndIf}
FunctionEnd

!macro customPageAfterChangeDir
  Page custom StellarLogsPage StellarLogsLeave
  Page custom StellarDataPage StellarDataLeave
!macroend

!macro customInstall
  WriteRegStr HKCU "Software\Stellar Polaris" "InstallDir" $INSTDIR
  WriteRegStr HKCU "Software\Stellar Polaris" "LogsDir" $STELLAR_LOGS_DIR
  WriteRegStr HKCU "Software\Stellar Polaris" "DataDir" $STELLAR_DATA_DIR

  CreateDirectory "$STELLAR_LOGS_DIR"
  CreateDirectory "$STELLAR_DATA_DIR"
  CreateDirectory "$APPDATA\Stellar Polaris"

  File /oname=$PLUGINSDIR\write-stellar-config.ps1 "${BUILD_RESOURCES_DIR}\write-stellar-config.ps1"
  System::Call 'Kernel32::SetEnvironmentVariable(t, t) i("STELLAR_INSTALL_DATA_DIR", "$STELLAR_DATA_DIR")'
  System::Call 'Kernel32::SetEnvironmentVariable(t, t) i("STELLAR_INSTALL_LOGS_DIR", "$STELLAR_LOGS_DIR")'
  ExecWait '"powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\write-stellar-config.ps1"'
!macroend

!macro customUnInstall
  Delete /REBOOTOK "$APPDATA\Stellar Polaris\config.json"
  DeleteRegKey HKCU "Software\Stellar Polaris"
!macroend
