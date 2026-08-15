' Routine — silent launcher.
'
' Windows shortcuts cannot start PowerShell without flashing a console window,
' so the shortcut points here instead: WScript can launch a process fully
' hidden.
'
' The one exception is first run. Installing dependencies and building takes
' minutes, and a hidden window would look exactly like nothing happening — so
' when the setup work is still outstanding, the console is shown on purpose.

Option Explicit

Dim fso, shell, scriptDir, root, psCmd, needsSetup, windowStyle
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
root = fso.GetParentFolderName(scriptDir)

' Show the window while there is real work to watch; hide it otherwise.
needsSetup = (Not fso.FolderExists(fso.BuildPath(root, "node_modules\vite"))) _
          Or (Not fso.FileExists(fso.BuildPath(root, "dist\index.html"))) _
          Or (Not fso.FileExists(fso.BuildPath(root, "data\routine.db")))

If needsSetup Then
  windowStyle = 1     ' normal, visible
Else
  windowStyle = 0     ' hidden
End If

psCmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & _
        fso.BuildPath(scriptDir, "launch.ps1") & """ -Mode prod"

' False = do not block; the launcher detaches the server itself.
shell.Run psCmd, windowStyle, False
