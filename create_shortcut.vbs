Set WShell = CreateObject("WScript.Shell")
Set shortcut = WShell.CreateShortcut("C:\Users\30667\Desktop\TaskTick-master\start_dev.lnk")
shortcut.TargetPath = "C:\Users\30667\Desktop\TaskTick-master\start_dev.bat"
shortcut.WindowStyle = 1
shortcut.Description = "TaskTick 一键启动"
shortcut.Save
WScript.Echo "快捷方式已创建: start_dev.lnk"
