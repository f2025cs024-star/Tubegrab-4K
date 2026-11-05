Option Explicit
Dim WshShell, fso, scriptDir, pywPath, configPath, ts, line, c, candidates, appPath, cmd, launched

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = scriptDir
appPath = scriptDir & "\idm_4k_app.py"

pywPath = ""

' 1. Check python_path.txt written by setup.ps1
configPath = scriptDir & "\python_path.txt"
If fso.FileExists(configPath) Then
    On Error Resume Next
    Set ts = fso.OpenTextFile(configPath, 1)
    If Not ts.AtEndOfStream Then
        line = Trim(ts.ReadLine())
        If fso.FileExists(line) Then
            pywPath = line
        End If
    End If
    ts.Close
    On Error Goto 0
End If

' 2. Search common Python 3 installation directories
If pywPath = "" Then
    candidates = Array( _
        WshShell.ExpandEnvironmentStrings("%LOCALAPPDATA%\Programs\Python\Python313\pythonw.exe"), _
        WshShell.ExpandEnvironmentStrings("%LOCALAPPDATA%\Programs\Python\Python312\pythonw.exe"), _
        WshShell.ExpandEnvironmentStrings("%LOCALAPPDATA%\Programs\Python\Python311\pythonw.exe"), _
        WshShell.ExpandEnvironmentStrings("%LOCALAPPDATA%\Programs\Python\Python310\pythonw.exe"), _
        WshShell.ExpandEnvironmentStrings("%LOCALAPPDATA%\Programs\Python\Python39\pythonw.exe"), _
        WshShell.ExpandEnvironmentStrings("%LOCALAPPDATA%\Microsoft\WindowsApps\pythonw.exe"), _
        WshShell.ExpandEnvironmentStrings("%LOCALAPPDATA%\Microsoft\WindowsApps\python.exe"), _
        WshShell.ExpandEnvironmentStrings("%ProgramFiles%\Python312\pythonw.exe"), _
        WshShell.ExpandEnvironmentStrings("%ProgramFiles%\Python311\pythonw.exe"), _
        WshShell.ExpandEnvironmentStrings("%ProgramFiles%\Python310\pythonw.exe"), _
        "C:\Python312\pythonw.exe", _
        "C:\Python311\pythonw.exe" _
    )
    For Each c In candidates
        If fso.FileExists(c) Then
            pywPath = c
            Exit For
        End If
    Next
End If

launched = False

' 3. Attempt launch with resolved path
If pywPath <> "" Then
    On Error Resume Next
    cmd = """" & pywPath & """ """ & appPath & """"
    WshShell.Run cmd, 0, False
    If Err.Number = 0 Then launched = True
    On Error Goto 0
End If

' 4. Fallback attempts using system PATH aliases
If Not launched Then
    candidates = Array("pythonw.exe", "pyw.exe", "python.exe", "py.exe")
    For Each c In candidates
        On Error Resume Next
        cmd = c & " """ & appPath & """"
        WshShell.Run cmd, 0, False
        If Err.Number = 0 Then
            launched = True
            Exit For
        End If
        On Error Goto 0
    Next
End If

' 5. If everything failed, inform user gracefully instead of throwing error 80070002
If Not launched Then
    MsgBox "TubeGrab 4K helper could not find Python on this computer." & vbCrLf & vbCrLf & _
           "Please run 'install.bat' inside this folder to configure Python automatically.", _
           vbExclamation, "TubeGrab 4K Setup Required"
End If
