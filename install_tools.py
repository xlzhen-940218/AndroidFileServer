import os
import sys
import subprocess
import platform

def install_adb():
    """
    安装ADB工具
    返回: (success, message) 元组，success为布尔值表示是否成功
    """
    system = platform.system().lower()
    print(f"🔧 开始安装 ADB...")
    
    if system == "windows":
        try:
            result = subprocess.run(
                ["winget", "install", "--id", "Google.PlatformTools", "--source", "winget"],
                check=True,
                capture_output=True,
                text=True
            )
            return True, "✅ ADB 安装成功！"
        except subprocess.CalledProcessError as e:
            return False, f"❌ ADB 安装失败: {e.stderr}\n请确保已安装 winget: https://aka.ms/getwinget"
        except FileNotFoundError:
            return False, "❌ 未找到 winget 命令\n请安装 Windows Package Manager: https://aka.ms/getwinget"

    elif system == "darwin":  # macOS
        try:
            result = subprocess.run(
                ["brew", "install", "android-platform-tools"],
                check=True,
                capture_output=True,
                text=True
            )
            return True, "✅ ADB 安装成功！"
        except subprocess.CalledProcessError as e:
            return False, f"❌ ADB 安装失败: {e.stderr}\n请确保已安装 Homebrew: https://brew.sh/"
        except FileNotFoundError:
            return False, "❌ 未找到 brew 命令\n请先安装 Homebrew: https://brew.sh/"

    elif system == "linux":
        managers = {
            "apt": ["sudo", "apt", "install", "-y", "android-tools-adb"],
            "dnf": ["sudo", "dnf", "install", "-y", "android-tools-adb"],
            "pacman": ["sudo", "pacman", "-S", "--noconfirm", "android-tools"],
            "zypper": ["sudo", "zypper", "install", "-y", "android-tools"]
        }
        
        for cmd, install_cmd in managers.items():
            if subprocess.run(["which", cmd], capture_output=True).returncode == 0:
                try:
                    subprocess.run(install_cmd, check=True, capture_output=True)
                    return True, "✅ ADB 安装成功！"
                except subprocess.CalledProcessError as e:
                    return False, f"❌ 使用 {cmd} 安装失败: {e.stderr}"
        
        return False, "❌ 无法确定包管理器\n请手动安装: Debian/Ubuntu: sudo apt install android-tools-adb\nFedora/RHEL: sudo dnf install android-tools-adb\nArch/Manjaro: sudo pacman -S android-tools\nopenSUSE: sudo zypper install android-tools"

    else:
        return False, f"❌ 不支持的操作系统: {system}"

def install_ffmpeg():
    """
    安装FFmpeg工具
    返回: (success, message) 元组，success为布尔值表示是否成功
    """
    system = platform.system().lower()
    print(f"🔧 开始安装 FFmpeg...")
    
    if system == "windows":
        try:
            result = subprocess.run(
                ["winget", "install", "--id", "Gyan.FFmpeg", "--source", "winget"],
                check=True,
                capture_output=True,
                text=True
            )
            return True, "✅ FFmpeg 安装成功！"
        except subprocess.CalledProcessError as e:
            return False, f"❌ FFmpeg 安装失败: {e.stderr}\n请确保已安装 winget: https://aka.ms/getwinget"
        except FileNotFoundError:
            return False, "❌ 未找到 winget 命令\n请安装 Windows Package Manager: https://aka.ms/getwinget"

    elif system == "darwin":  # macOS
        try:
            result = subprocess.run(
                ["brew", "install", "ffmpeg"],
                check=True,
                capture_output=True,
                text=True
            )
            return True, "✅ FFmpeg 安装成功！"
        except subprocess.CalledProcessError as e:
            return False, f"❌ FFmpeg 安装失败: {e.stderr}\n请确保已安装 Homebrew: https://brew.sh/"
        except FileNotFoundError:
            return False, "❌ 未找到 brew 命令\n请先安装 Homebrew: https://brew.sh/"

    elif system == "linux":
        managers = {
            "apt": ["sudo", "apt", "install", "-y", "ffmpeg"],
            "dnf": ["sudo", "dnf", "install", "-y", "ffmpeg"],
            "pacman": ["sudo", "pacman", "-S", "--noconfirm", "ffmpeg"],
            "zypper": ["sudo", "zypper", "install", "-y", "ffmpeg"]
        }
        
        for cmd, install_cmd in managers.items():
            if subprocess.run(["which", cmd], capture_output=True).returncode == 0:
                try:
                    subprocess.run(install_cmd, check=True, capture_output=True)
                    return True, "✅ FFmpeg 安装成功！"
                except subprocess.CalledProcessError as e:
                    return False, f"❌ 使用 {cmd} 安装失败: {e.stderr}"
        
        return False, "❌ 无法确定包管理器\n请手动安装: Debian/Ubuntu: sudo apt install ffmpeg\nFedora/RHEL: sudo dnf install ffmpeg\nArch/Manjaro: sudo pacman -S ffmpeg\nopenSUSE: sudo zypper install ffmpeg"

    else:
        return False, f"❌ 不支持的操作系统: {system}"

def verify_installation(tool_name):
    """
    验证工具是否安装成功
    :param tool_name: 'adb' 或 'ffmpeg'
    :return: (success, version_info) 元组
    """
    try:
        if tool_name == "adb":
            result = subprocess.run(
                ["adb", "--version"],
                capture_output=True,
                text=True
            )
            if result.returncode == 0:
                version_line = result.stdout.splitlines()[0]
                return True, f"✅ ADB 验证成功: {version_line}"
        elif tool_name == "ffmpeg":
            result = subprocess.run(
                ["ffmpeg", "-version"],
                capture_output=True,
                text=True
            )
            if result.returncode == 0:
                version_line = result.stdout.splitlines()[0].split()[2]
                return True, f"✅ FFmpeg 验证成功: 版本 {version_line}"
    except:
        pass
    
    return False, f"⚠️ 找不到 {tool_name} 命令，请尝试重新启动终端或手动添加环境变量"

def install_all():
    """
    安装所有必要工具（ADB和FFmpeg）
    返回: 包含安装结果的字典
    """
    results = {
        "adb": {"success": False, "message": ""},
        "ffmpeg": {"success": False, "message": ""},
        "adb_verify": {"success": False, "message": ""},
        "ffmpeg_verify": {"success": False, "message": ""}
    }
    
    # 安装ADB
    adb_success, adb_msg = install_adb()
    results["adb"]["success"] = adb_success
    results["adb"]["message"] = adb_msg
    
    # 安装FFmpeg
    ffmpeg_success, ffmpeg_msg = install_ffmpeg()
    results["ffmpeg"]["success"] = ffmpeg_success
    results["ffmpeg"]["message"] = ffmpeg_msg
    
    # 验证安装
    if adb_success:
        verify_success, verify_msg = verify_installation("adb")
        results["adb_verify"]["success"] = verify_success
        results["adb_verify"]["message"] = verify_msg
    
    if ffmpeg_success:
        verify_success, verify_msg = verify_installation("ffmpeg")
        results["ffmpeg_verify"]["success"] = verify_success
        results["ffmpeg_verify"]["message"] = verify_msg
    
    return results

if __name__ == "__main__":
    print("="*50)
    print(f"🚀 正在为 {platform.system()} 安装必要工具...")
    print("="*50)
    
    results = install_all()
    
    print("\n📊 安装结果摘要:")
    print(f"ADB 安装: {'成功' if results['adb']['success'] else '失败'} - {results['adb']['message']}")
    print(f"ADB 验证: {'成功' if results['adb_verify']['success'] else '失败'} - {results['adb_verify']['message']}")
    print(f"FFmpeg 安装: {'成功' if results['ffmpeg']['success'] else '失败'} - {results['ffmpeg']['message']}")
    print(f"FFmpeg 验证: {'成功' if results['ffmpeg_verify']['success'] else '失败'} - {results['ffmpeg_verify']['message']}")
    
    print("\n" + "="*50)
    print("💡 提示: 如果验证失败，请尝试重启终端后再试")
    print("="*50)