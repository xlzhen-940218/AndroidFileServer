const { execSync, exec } = require('child_process');
const os = require('os');

// 映射平台名称
function getPlatform() {
    const platform = os.platform();
    if (platform === 'win32') return 'windows';
    if (platform === 'darwin') return 'darwin';
    return platform; // linux 或其他
}

/**
 * 安装ADB工具
 * @returns {{success: boolean, message: string}} 安装结果
 */
function installAdb() {
    const platform = getPlatform();
    console.log("🔧 开始安装 ADB...");

    try {
        if (platform === 'windows') {
            execSync('winget install --id Google.PlatformTools --source winget', { stdio: 'inherit' });
            return { success: true, message: "✅ ADB 安装成功！" };
        } 
        else if (platform === 'darwin') {
            execSync('brew install android-platform-tools', { stdio: 'inherit' });
            return { success: true, message: "✅ ADB 安装成功！" };
        } 
        else if (platform === 'linux') {
            const packageManagers = [
                { cmd: 'apt', args: ['sudo', 'apt', 'install', '-y', 'android-tools-adb'] },
                { cmd: 'dnf', args: ['sudo', 'dnf', 'install', '-y', 'android-tools-adb'] },
                { cmd: 'pacman', args: ['sudo', 'pacman', '-S', '--noconfirm', 'android-tools'] },
                { cmd: 'zypper', args: ['sudo', 'zypper', 'install', '-y', 'android-tools'] }
            ];

            for (const pm of packageManagers) {
                try {
                    execSync(`which ${pm.cmd}`, { stdio: 'ignore' });
                    execSync(pm.args.join(' '), { stdio: 'inherit' });
                    return { success: true, message: "✅ ADB 安装成功！" };
                } catch (e) {
                    // 尝试下一个包管理器
                }
            }
            throw new Error("无法确定包管理器");
        } 
        else {
            throw new Error(`不支持的操作系统: ${platform}`);
        }
    } catch (error) {
        if (platform === 'windows') {
            return { 
                success: false, 
                message: `❌ ADB 安装失败: ${error.message}\n请确保已安装 winget: https://aka.ms/getwinget`
            };
        } 
        else if (platform === 'darwin') {
            return { 
                success: false, 
                message: `❌ ADB 安装失败: ${error.message}\n请确保已安装 Homebrew: https://brew.sh/`
            };
        } 
        else if (platform === 'linux') {
            return {
                success: false,
                message: '❌ 无法确定包管理器\n请手动安装: Debian/Ubuntu: sudo apt install android-tools-adb\n' +
                         'Fedora/RHEL: sudo dnf install android-tools-adb\n' +
                         'Arch/Manjaro: sudo pacman -S android-tools\n' +
                         'openSUSE: sudo zypper install android-tools'
            };
        } 
        else {
            return { success: false, message: `❌ 不支持的操作系统: ${platform}` };
        }
    }
}

/**
 * 安装FFmpeg工具
 * @returns {{success: boolean, message: string}} 安装结果
 */
function installFfmpeg() {
    const platform = getPlatform();
    console.log("🔧 开始安装 FFmpeg...");

    try {
        if (platform === 'windows') {
            execSync('winget install --id Gyan.FFmpeg --source winget', { stdio: 'inherit' });
            return { success: true, message: "✅ FFmpeg 安装成功！" };
        } 
        else if (platform === 'darwin') {
            execSync('brew install ffmpeg', { stdio: 'inherit' });
            return { success: true, message: "✅ FFmpeg 安装成功！" };
        } 
        else if (platform === 'linux') {
            const packageManagers = [
                { cmd: 'apt', args: ['sudo', 'apt', 'install', '-y', 'ffmpeg'] },
                { cmd: 'dnf', args: ['sudo', 'dnf', 'install', '-y', 'ffmpeg'] },
                { cmd: 'pacman', args: ['sudo', 'pacman', '-S', '--noconfirm', 'ffmpeg'] },
                { cmd: 'zypper', args: ['sudo', 'zypper', 'install', '-y', 'ffmpeg'] }
            ];

            for (const pm of packageManagers) {
                try {
                    execSync(`which ${pm.cmd}`, { stdio: 'ignore' });
                    execSync(pm.args.join(' '), { stdio: 'inherit' });
                    return { success: true, message: "✅ FFmpeg 安装成功！" };
                } catch (e) {
                    // 尝试下一个包管理器
                }
            }
            throw new Error("无法确定包管理器");
        } 
        else {
            throw new Error(`不支持的操作系统: ${platform}`);
        }
    } catch (error) {
        if (platform === 'windows') {
            return { 
                success: false, 
                message: `❌ FFmpeg 安装失败: ${error.message}\n请确保已安装 winget: https://aka.ms/getwinget`
            };
        } 
        else if (platform === 'darwin') {
            return { 
                success: false, 
                message: `❌ FFmpeg 安装失败: ${error.message}\n请确保已安装 Homebrew: https://brew.sh/`
            };
        } 
        else if (platform === 'linux') {
            return {
                success: false,
                message: '❌ 无法确定包管理器\n请手动安装: Debian/Ubuntu: sudo apt install ffmpeg\n' +
                         'Fedora/RHEL: sudo dnf install ffmpeg\n' +
                         'Arch/Manjaro: sudo pacman -S ffmpeg\n' +
                         'openSUSE: sudo zypper install ffmpeg'
            };
        } 
        else {
            return { success: false, message: `❌ 不支持的操作系统: ${platform}` };
        }
    }
}

/**
 * 验证工具是否安装成功
 * @param {'adb' | 'ffmpeg'} toolName 工具名称
 * @returns {{success: boolean, message: string}} 验证结果
 */
function verifyInstallation(toolName) {
    try {
        if (toolName === 'adb') {
            const output = execSync('adb --version', { encoding: 'utf-8' });
            const versionLine = output.split('\n')[0];
            return { success: true, message: `✅ ADB 验证成功: ${versionLine}` };
        } 
        else if (toolName === 'ffmpeg') {
            const output = execSync('ffmpeg -version', { encoding: 'utf-8' });
            const version = output.split('\n')[0].split(' ')[2];
            return { success: true, message: `✅ FFmpeg 验证成功: 版本 ${version}` };
        }
    } catch (error) {
        return { success: false, message: `⚠️ 找不到 ${toolName} 命令，请尝试重新启动终端或手动添加环境变量` };
    }
}

/**
 * 安装所有必要工具（ADB和FFmpeg）
 * @returns {Object} 安装结果
 */
function installAll() {
    const results = {
        adb: { success: false, message: '' },
        ffmpeg: { success: false, message: '' },
        adb_verify: { success: false, message: '' },
        ffmpeg_verify: { success: false, message: '' }
    };

    // 安装ADB
    const adbResult = installAdb();
    results.adb = adbResult;

    // 安装FFmpeg
    const ffmpegResult = installFfmpeg();
    results.ffmpeg = ffmpegResult;

    // 验证安装
    if (adbResult.success) {
        results.adb_verify = verifyInstallation('adb');
    }
    if (ffmpegResult.success) {
        results.ffmpeg_verify = verifyInstallation('ffmpeg');
    }

    return results;
}

// 主程序入口
if (require.main === module) {
    console.log("=".repeat(50));
    console.log(`🚀 正在为 ${os.platform()} 安装必要工具...`);
    console.log("=".repeat(50));

    const results = installAll();

    console.log("\n📊 安装结果摘要:");
    console.log(`ADB 安装: ${results.adb.success ? '成功' : '失败'} - ${results.adb.message}`);
    console.log(`ADB 验证: ${results.adb_verify.success ? '成功' : '失败'} - ${results.adb_verify.message}`);
    console.log(`FFmpeg 安装: ${results.ffmpeg.success ? '成功' : '失败'} - ${results.ffmpeg.message}`);
    console.log(`FFmpeg 验证: ${results.ffmpeg_verify.success ? '成功' : '失败'} - ${results.ffmpeg_verify.message}`);

    console.log("\n" + "=".repeat(50));
    console.log("💡 提示: 如果验证失败，请尝试重启终端后再试");
    console.log("=".repeat(50));
}

// 暴露接口
module.exports = {
    installAdb,
    installFfmpeg,
    verifyInstallation,
    installAll
};