$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("C:\Users\30667\Desktop\start_dev.lnk")
$Shortcut.TargetPath = "C:\Users\30667\Desktop\TaskTick-master\start_dev.bat"
$Shortcut.WindowStyle = 1
$Shortcut.Description = "TaskTick Launcher"
$Shortcut.Save()
Write-Host "done"
