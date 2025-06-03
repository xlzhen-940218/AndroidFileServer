# app.py
from flask import Flask, render_template, request, jsonify, Response, make_response, send_file
import subprocess
import re
import math
import os
import logging
from functools import wraps

from pathlib import Path

def generate_thumbnail(media_path: str) -> str:
    """
    为视频/图片生成缩略图，缓存到.cache_thumbnail目录
    :param media_path: 媒体文件路径
    :return: 缩略图路径（生成失败返回空字符串）
    """
    # 创建缓存目录
    cache_dir = Path.cwd() / ".cache_thumbnail"
    cache_dir.mkdir(exist_ok=True, parents=True)
    
    # 构建输出路径：原文件名 + _thumb.jpg
    media_file = Path(media_path)
    thumb_name = f"{media_file.stem}_thumb.jpg"
    thumb_path = cache_dir / thumb_name
    
    # 如果缩略图已存在则直接返回
    if thumb_path.exists():
        return str(thumb_path)
    
    try:
        # FFmpeg命令：缩放并裁剪（保持宽高比）
        ffmpeg_cmd = [
            'ffmpeg',
            '-i', media_path,              # 输入文件
            '-vf', 'scale=960:960:force_original_aspect_ratio=decrease',  # 缩放并居中裁剪
            '-vframes', '1',               # 只处理1帧
            '-y',                          # 覆盖已存在文件
            '-loglevel', 'error',          # 仅显示错误信息
            str(thumb_path)
        ]
        
        # 执行命令（隐藏命令行窗口）
        subprocess.run(ffmpeg_cmd, check=True, 
                      creationflags=subprocess.CREATE_NO_WINDOW)
        
        return str(thumb_path)
    
    except (subprocess.CalledProcessError, FileNotFoundError, Exception) as e:
        print(f"缩略图生成失败: {e}")
        return ""

# 初始化Flask应用
app = Flask(__name__)

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 常量定义
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STORAGE_DIR = os.path.join(BASE_DIR, 'storage')
PER_PAGE = 64  # 每页显示数量
ADB_TIMEOUT = 30  # ADB命令超时时间(秒)
IMAGE_REGEX = re.compile(
    r"Row: \d+ _id=(?P<_id>[^,]+),\s+"
    r"_data=(?P<_data>[^,]+),\s+"
    r"mime_type=(?P<mime_type>[^,]+),\s+"
    r"_size=(?P<_size>[^,]+),\s+"
    r"_display_name=(?P<_display_name>[^,]+),\s+"
    r"width=(?P<width>[^,]+),\s+"
    r"height=(?P<height>[^,]+),\s+"
    r"date_added=(?P<date_added>[^,]+)"
)

AUDIO_REGEX = re.compile(
    r"Row: \d+ _id=(?P<_id>[^,]+),\s+"
    r"_data=(?P<_data>[^,]+),\s+"
    r"mime_type=(?P<mime_type>[^,]+),\s+"
    r"_size=(?P<_size>[^,]+),\s+"
    r"_display_name=(?P<_display_name>[^,]+),\s+"
    r"date_added=(?P<date_added>[^,]+)"
)

# MIME类型映射
MIME_TYPES = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.txt': 'text/plain',
    '.log': 'text/plain',
}

def ensure_directory(path):
    """确保目录存在，不存在则创建"""
    os.makedirs(path, exist_ok=True)
    logger.info(f"确保目录存在: {path}")

def device_id_required(func):
    """装饰器：验证请求中是否包含设备ID"""
    @wraps(func)
    def wrapper(*args, **kwargs):
        device_id = request.args.get('id') or request.json.get('id')
        if not device_id:
            logger.warning("缺少设备ID参数")
            return jsonify({'error': 'Missing device ID'}), 400
        return func(*args, **kwargs)
    return wrapper

def run_adb_command(command, device_id=None, timeout=ADB_TIMEOUT, capture_output=True):
    """
    执行ADB命令的通用函数
    
    参数:
        command: ADB命令列表或字符串
        device_id: 设备ID(可选)
        timeout: 命令超时时间
        capture_output: 是否捕获输出
    
    返回:
        subprocess.CompletedProcess对象
    """
    # 构建基础命令
    base_cmd = ['adb']
    if device_id:
        base_cmd.extend(['-s', device_id])
    
    # 处理命令格式
    if isinstance(command, str):
        full_cmd = base_cmd + command.split()
    else:
        full_cmd = base_cmd + command
    
    logger.info(f"执行ADB命令: {' '.join(full_cmd)}")
    
    try:
        return subprocess.run(
            full_cmd,
            capture_output=capture_output,
            text=True,
            timeout=timeout,
            check=True,
            encoding='utf-8',        # 指定 UTF-8 编码
            errors='ignore'          # 忽略无法解码的字符（可选：'replace' 用占位符替代）
        )
    except subprocess.CalledProcessError as e:
        logger.error(f"ADB命令执行失败: {e.stderr}")
        raise RuntimeError(f"ADB命令失败: {e.stderr}") from e
    except subprocess.TimeoutExpired as e:
        logger.error(f"ADB命令超时: {e}")
        raise RuntimeError("ADB命令超时") from e

def pull_file_from_device(device_id, remote_path, local_path):
    """使用ADB从设备拉取文件到本地"""
    try:
        result = run_adb_command(['pull', remote_path, local_path], device_id)
        logger.info(f"文件拉取成功: {remote_path} -> {local_path}")
        return True, result.stdout
    except Exception as e:
        error_msg = f"文件拉取失败: {str(e)}"
        logger.error(error_msg)
        return False, error_msg

def parse_adb_output(output,type='image'):
    """解析adb命令输出的文本，转换为结构化数据"""
    result = []
    
    for line in output.splitlines():
        match = IMAGE_REGEX.match(line) if type == 'image' else AUDIO_REGEX.match(line)
        if match:
            try:
                item = match.groupdict()
                # 转换数值类型字段
                if type == 'image':
                    for key in ['_id', '_size', 'width', 'height']:
                        item[key] = int(item[key])
                else:
                    for key in ['_id', '_size']:
                        item[key] = int(item[key])
                result.append(item)
            except (ValueError, TypeError) as e:
                logger.warning(f"解析行失败: {line} - {str(e)}")
    
    logger.info(f"成功解析 {len(result)} 个图像条目")
    return result

def get_mime_type(filename):
    """根据文件扩展名获取MIME类型"""
    _, ext = os.path.splitext(filename)
    return MIME_TYPES.get(ext.lower(), 'application/octet-stream')

# 路由定义
@app.route('/')
def wait_connect():
    """等待设备连接页面"""
    return render_template('device_connect.html')

@app.route('/index.html')
def home():
    """首页"""
    return render_template('index.html')

@app.route('/api/file', methods=['GET'])
@device_id_required
def get_file():
    """
    API: 获取设备文件
    
    参数:
        file_path: 设备上的文件路径
        category: 文件类别
        file_name: 文件名
        id: 设备ID
    """
    # 获取查询参数
    file_path = request.args.get('file_path')
    category = request.args.get('category')
    file_name = request.args.get('file_name')
    device_id = request.args.get('id')
    
    # 验证必要参数
    if not all([file_path, category, file_name]):
        logger.warning("缺少必要参数: file_path, category, file_name")
        return jsonify({
            'error': 'Missing required parameters: file_path, category, file_name'
        }), 400
    
    # 创建目标目录
    target_dir = os.path.join(STORAGE_DIR, device_id, category)
    ensure_directory(target_dir)
    
    # 构建本地文件路径
    local_file = os.path.join(target_dir, file_name)
    
    # 如果文件不存在，尝试从设备拉取
    if not os.path.exists(local_file):
        success, message = pull_file_from_device(device_id, file_path, local_file)
        if not success:
            return jsonify({
                'error': 'File transfer failed',
                'details': message
            }), 500
            
        # 再次验证是否拉取成功
        if not os.path.exists(local_file):
            return jsonify({
                'error': 'File not found after transfer attempt',
                'details': message
            }), 404
    
    # 直接返回文件内容
    try:
        return send_file(
            local_file,
            as_attachment=True
    )
    except Exception as e:
        logger.error(f"发送文件失败: {str(e)}")
        return jsonify({'error': f'Failed to send file: {str(e)}'}), 500
    
@app.route('/api/thumbnail', methods=['GET'])
@device_id_required
def get_thumbnail():
    """
    API: 获取设备文件缩略图

    参数:
        file_path: 设备上的文件路径
        category: 文件类别
        file_name: 文件名
        id: 设备ID
    """
    # 获取查询参数
    file_path = request.args.get('file_path')
    category = request.args.get('category')
    file_name = request.args.get('file_name')
    device_id = request.args.get('id')
    
    # 验证必要参数
    if not all([file_path, category, file_name]):
        logger.warning("缺少必要参数: file_path, category, file_name")
        return jsonify({
            'error': 'Missing required parameters: file_path, category, file_name'
        }), 400
    
    # 创建目标目录
    target_dir = os.path.join(STORAGE_DIR, device_id, category)
    ensure_directory(target_dir)
    
    # 构建本地文件路径
    local_file = os.path.join(target_dir, file_name)
    
    # 如果文件不存在，尝试从设备拉取
    if not os.path.exists(local_file):
        success, message = pull_file_from_device(device_id, file_path, local_file)
        if not success:
            return jsonify({
                'error': 'File transfer failed',
                'details': message
            }), 500
            
        # 再次验证是否拉取成功
        if not os.path.exists(local_file):
            return jsonify({
                'error': 'File not found after transfer attempt',
                'details': message
            }), 404
    
    # 直接返回文件内容
    try:
        mimetype = get_mime_type(file_name)
        response = make_response(send_file(generate_thumbnail(local_file), mimetype=mimetype))
        response.headers['Cache-Control'] = 'public, max-age=86400'  # 1天缓存
        return response
    except Exception as e:
        logger.error(f"发送文件失败: {str(e)}")
        return jsonify({'error': f'Failed to send file: {str(e)}'}), 500

@app.route('/api/get_images', methods=['GET'])
@device_id_required
def get_images():
    """
    API: 获取设备图像列表
    
    参数:
        id: 设备ID
    """
    device_id = request.args.get('id')
    
    try:
        # 构建ADB命令
        adb_command = [
            'shell', 'content', 'query',
            '--uri', 'content://media/external/images/media',
            '--projection', '_id:_data:mime_type:_size:_display_name:width:height:date_added'
        ]
        
        # 执行命令
        result = run_adb_command(adb_command, device_id)
        
        # 解析输出
        image_data = parse_adb_output(result.stdout)
        return jsonify(image_data)
    
    except RuntimeError as e:
        return jsonify({
            "error": "ADB命令执行失败",
            "details": str(e)
        }), 500
    except Exception as e:
        logger.exception("获取图像时发生意外错误")
        return jsonify({
            "error": "服务器内部错误",
            "details": str(e)
        }), 500
    
@app.route('/api/get_videos', methods=['GET'])
@device_id_required
def get_videos():
    """
    API: 获取设备视频列表

    参数:
        id: 设备ID
    """
    device_id = request.args.get('id')
    
    try:
        # 构建ADB命令
        adb_command = [
            'shell', 'content', 'query',
            '--uri', 'content://media/external/video/media',
            '--projection', '_id:_data:mime_type:_size:_display_name:width:height:date_added'
        ]
        
        # 执行命令
        result = run_adb_command(adb_command, device_id)
        
        # 解析输出
        video_data = parse_adb_output(result.stdout)
        return jsonify(video_data)

    except RuntimeError as e:
        return jsonify({
            "error": "ADB命令执行失败",
            "details": str(e)
        }), 500
    except Exception as e:
        logger.exception("获取图像时发生意外错误")
        return jsonify({
            "error": "服务器内部错误",
            "details": str(e)
        }), 500
    
@app.route('/api/get_audios', methods=['GET'])
@device_id_required
def get_audios():
    """
    API: 获取设备音频列表

    参数:
        id: 设备ID
    """
    device_id = request.args.get('id')
    
    try:
        # 构建ADB命令
        adb_command = [
            'shell', 'content', 'query',
            '--uri', 'content://media/external/audio/media',
            '--projection', '_id:_data:mime_type:_size:_display_name:date_added'
        ]
        
        # 执行命令
        result = run_adb_command(adb_command, device_id)
        
        # 解析输出
        audio_data = parse_adb_output(result.stdout, type='audio')
        return jsonify(audio_data)

    except RuntimeError as e:
        return jsonify({
            "error": "ADB命令执行失败",
            "details": str(e)
        }), 500
    except Exception as e:
        logger.exception("获取音频时发生意外错误")
        return jsonify({
            "error": "服务器内部错误",
            "details": str(e)
        }), 500
    
@app.route('/api/get_documents', methods=['GET'])
@device_id_required
def get_documents():
    """
    API: 获取设备文档列表

    参数:
        id: 设备ID
    """
    device_id = request.args.get('id')
    document_type = request.args.get('document_type', 'document')
    
    # 验证必要参数
    if not all([document_type]):
        logger.warning("缺少必要参数: document_type")
        return jsonify({
            'error': 'Missing required parameters: document_type'
        }), 400
    
    try:
        document_end_suffix = "'\\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|odt|ods|odp)'"
        if document_type == 'zip':
            document_end_suffix = "'\\.(zip|rar|7z|tar|gz)'"
        elif document_type == 'apk':
            document_end_suffix = "'\\.(apk)'"

        # 构建ADB命令
        adb_command = [
            'shell', "content query --uri content://media/external/file --projection _id:_data:mime_type:_size:_display_name:date_added | grep -E "+ document_end_suffix
        ]
        
        # 执行命令
        result = run_adb_command(adb_command, device_id)
        
        # 解析输出
        document_data = parse_adb_output(result.stdout, type='document')
        return jsonify(document_data)

    except RuntimeError as e:
        return jsonify({
            "error": "ADB命令执行失败",
            "details": str(e)
        }), 500
    except Exception as e:
        logger.exception("获取文档时发生意外错误")
        return jsonify({
            "error": "服务器内部错误",
            "details": str(e)
        }), 500

@app.route('/screenshot/<device_id>')
def get_screenshot(device_id):
    try:
        # 构建 ADB 命令
        command = f"adb -s {device_id} exec-out screencap -p"
        
        # 执行命令并捕获二进制输出
        result = subprocess.run(
            command.split(),
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=10  # 设置超时防止卡死
        )
        
        # 返回二进制图像数据
        return Response(
            result.stdout,
            mimetype='image/png'
        )
        
    except subprocess.CalledProcessError as e:
        return f"ADB Error: {e.stderr.decode('utf-8')}", 500
    except subprocess.TimeoutExpired:
        return "ADB command timed out", 504
    except Exception as e:
        return f"Unexpected error: {str(e)}", 500

def get_device_name(device_id):
    """获取设备名称"""
    result = run_adb_command('shell getprop ro.product.model', device_id)
    return result.stdout.strip()

def get_storage_info(device_id):
    """获取存储空间信息（单位：GB）"""
    result = run_adb_command('shell df /data', device_id)
    lines = result.stdout.strip().splitlines()
    
    if len(lines) < 2:
        raise ValueError("存储信息格式错误")
    
    # 获取最后一行（数据行）
    parts = lines[-1].split()
    if len(parts) < 5:
        raise ValueError("存储信息格式错误")
    
    # 转换为GB (1块 = 1KB)
    total_kb = int(parts[1])
    used_kb = int(parts[2])
    available_kb = int(parts[3])
    
    # 转换为GB (1 GB = 1024*1024 KB)
    total_gb = round(total_kb / (1024 * 1024), 2)
    used_gb = round(used_kb / (1024 * 1024), 2)
    available_gb = round(available_kb / (1024 * 1024), 2)
    
    return {
        "total": total_gb,
        "used": used_gb,
        "available": available_gb
    }

def get_battery_level(device_id):
    """获取电池电量百分比"""
    result = run_adb_command('shell dumpsys battery', device_id)
    
    # 使用正则表达式匹配电量值
    match = re.search(r'level:\s*(\d+)', result.stdout)
    if not match:
        raise ValueError("未找到电池电量信息")
    
    return int(match.group(1))

@app.route('/api/device_info', methods=['POST'])
@device_id_required
def get_device_info():
    """
    API: 获取设备信息
    
    参数(JSON):
        id: 设备ID
    """
    device_id = request.json.get('id')
    
    try:
        device_name = get_device_name(device_id)
        storage_info = get_storage_info(device_id)
        battery_level = get_battery_level(device_id)
        
        return jsonify({
            'cover_img': f'/screenshot/{device_id}',
            'phone_name': device_name,
            'storage_total_size': storage_info["total"],
            'storage_use_size': storage_info["used"],
            'battery_use': battery_level
        })
    except Exception as e:
        logger.error(f"获取设备信息失败: {str(e)}")
        return jsonify({'error': str(e)}), 500

def get_adb_devices():
    """获取已连接的ADB设备列表"""
    try:
        result = run_adb_command('devices', timeout=10)
        output = result.stdout
        
        # 解析设备列表
        devices = []
        for line in output.splitlines()[1:]:  # 跳过标题行
            if line.strip() and 'device' in line:
                parts = line.split()
                if len(parts) >= 2 and parts[1] == 'device':
                    devices.append(parts[0])
        
        return {
            'connected': bool(devices),
            'devices': devices  # 返回所有设备列表
        }
    except Exception as e:
        logger.error(f"获取ADB设备失败: {str(e)}")
        return {'connected': False, 'devices': []}

@app.route('/api/get_device', methods=['GET'])
def device_status():
    """API: 获取设备连接状态"""
    return jsonify(get_adb_devices())

if __name__ == '__main__':
    ensure_directory(STORAGE_DIR)
    logger.info("应用启动，存储目录: %s", STORAGE_DIR)
    app.run(debug=True, host='0.0.0.0', port=5000)