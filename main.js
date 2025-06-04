const express = require('express');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const util = require('util');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const morgan = require('morgan');
const winston = require('winston');
const mime = require('mime-types');
const bodyParser = require('body-parser');
const { verifyInstallation,installFfmpeg,installAdb } = require('./install_tools.js');

const app = express();
const PORT = 5001;

app.use('/static', express.static(path.join(__dirname, 'static')));

// 中间件：重写Flask模板语法到Node.js路径
app.use(async (req, res, next) => {
  // 只处理HTML文件
  if (req.path.endsWith('.html')) {
    try {
      const filePath = path.join(__dirname, 'templates', req.path);
        // 使用正确的文件读取方式
        fs.readFile(filePath, 'utf8', (err, data) => {
          if (err) {
            if (err.code === 'ENOENT') {
              return res.status(404).send('File not found');
            }
            return next(err);
          }
          
          // 替换Flask模板语法为Node.js路径
          let html = data.replace(
            /{{\s*url_for\('static',\s*filename=('|")([^'"]+)('|")\s*\)\s*}}/g,
            '/static/$2'
          );
          
          res.send(html);
        });
    } catch (err) {
      next(err); // 文件不存在或其他错误
    }
  } else {
    next(); // 非HTML文件继续正常处理
  }
});

// 配置日志
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level.toUpperCase()}]: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'app.log' })
  ]
});

app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 常量定义
const BASE_DIR = __dirname;
const STORAGE_DIR = path.join(BASE_DIR, 'storage');
const CACHE_DIR = path.join(BASE_DIR, '.cache_thumbnail');
const ADB_TIMEOUT = 30000; // 30秒超时
const PER_PAGE = 64;

// 确保目录存在
const ensureDirectory = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    logger.info(`确保目录存在: ${dirPath}`);
  }
};

// 设备ID验证中间件
const deviceIdRequired = (req, res, next) => {
  const deviceId = req.query.id || (req.body && req.body.id);
  if (!deviceId) {
    logger.warning("缺少设备ID参数");
    return res.status(400).json({ error: 'Missing device ID' });
  }
  req.deviceId = deviceId;
  next();
};

// 执行ADB命令的通用函数
const runAdbCommand = (command, deviceId = null, timeout = ADB_TIMEOUT) => {
  return new Promise((resolve, reject) => {
    const baseCmd = ['adb'];
    if (deviceId) {
      baseCmd.push('-s', deviceId);
    }
    
    const fullCmd = [...baseCmd, ...(Array.isArray(command) ? command : command.split(' '))];
    const cmdStr = fullCmd.join(' ');
    
    logger.info(`执行ADB命令: ${cmdStr}`);
    
    const child = spawn(fullCmd[0], fullCmd.slice(1), {
      timeout,
      encoding: 'utf-8'
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        const error = new Error(`ADB命令失败: ${stderr || '未知错误'}`);
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
      }
    });
    
    child.on('error', (err) => {
      reject(err);
    });
  });
};

// 从设备拉取文件
const pullFileFromDevice = async (deviceId, remotePath, localPath) => {
  try {
    ensureDirectory(path.dirname(localPath));
    const { stdout } = await runAdbCommand(['pull', remotePath, localPath], deviceId);
    logger.info(`文件拉取成功: ${remotePath} -> ${localPath}`);
    return { success: true, message: stdout };
  } catch (error) {
    const errMsg = `文件拉取失败: ${error.message}`;
    logger.error(errMsg);
    return { success: false, message: errMsg };
  }
};

// 解析ls命令输出
const parseLsOutput = (lsText, dirPath) => {
  const result = [];
  const lines = lsText.trim().split('\n');
  
  // 规范化目录路径
  const normalizedDir = dirPath.endsWith('/') ? dirPath : `${dirPath}/`;
  const regex = /^([d-])([rwxst-]{9})\s+(\d+)\s+(\S+)\s+(\S+)\s+(\s*\d+(?:\.\d+)?[KMG]?B?)\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s+(.+)$/;
  for (const line of lines) {
    // 使用正则表达式匹配行
    const match = line.trim().match(regex);
    if (!match){
      logger.warn(`无法解析行: ${line}`);
      continue;
    } 
    logger.info(`解析行: ${line}`);
    const [
      , entryType, permissions, links, owner, group, sizeStr, dateStr, timeStr, name
    ] = match;
    
    // 处理文件大小
    const sizeVal = parseFloat(sizeStr.replace(/[^\d.]/g, ''));
    let size = sizeVal;
    
    if (sizeStr.toUpperCase().includes('K')) size *= 1024;
    else if (sizeStr.toUpperCase().includes('M')) size *= 1024 * 1024;
    else if (sizeStr.toUpperCase().includes('G')) size *= 1024 * 1024 * 1024;
    
    // 转换日期时间
    let timestamp = "0";
    try {
      const dt = new Date(`${dateStr}T${timeStr}:00`);
      timestamp = Math.floor(dt.getTime() / 1000).toString();
    } catch (e) {
      logger.warn(`日期解析失败: ${dateStr} ${timeStr}`);
    }
    
    // 确定MIME类型
    let mimeType;
    if (entryType === 'd') {
      mimeType = 'inode/directory';
    } else {
      mimeType = mime.lookup(name) || 'application/octet-stream';
    }
    
    // 构建结果对象
    result.push({
      _data: normalizedDir + name,
      _display_name: name,
      _size: Math.round(size),
      date_added: timestamp,
      mime_type: mimeType,
      path: normalizedDir
    });
  }
  
  return result;
};

// 生成缩略图
const generateThumbnail = (mediaPath) => {
  return new Promise((resolve) => {
    ensureDirectory(CACHE_DIR);
    
    const ext = path.extname(mediaPath);
    const baseName = path.basename(mediaPath, ext);
    const thumbPath = path.join(CACHE_DIR, `${baseName}_thumb.jpg`);
    
    // 如果缩略图已存在则直接返回
    if (fs.existsSync(thumbPath)) {
      return resolve(thumbPath);
    }
    
    // FFmpeg命令：缩放并裁剪
    const ffmpegCmd = [
      'ffmpeg',
      '-i', mediaPath,
      '-vf', 'scale=960:960:force_original_aspect_ratio=decrease',
      '-vframes', '1',
      '-y',
      '-loglevel', 'error',
      thumbPath
    ];
    
    const child = spawn(ffmpegCmd[0], ffmpegCmd.slice(1));
    
    child.on('close', (code) => {
      if (code === 0 && fs.existsSync(thumbPath)) {
        resolve(thumbPath);
      } else {
        logger.error(`缩略图生成失败: ${mediaPath}`);
        resolve('');
      }
    });
    
    child.on('error', (err) => {
      logger.error(`FFmpeg执行错误: ${err.message}`);
      resolve('');
    });
  });
};

// 解析ADB输出
const parseAdbOutput = (output, type = 'image') => {
  const result = [];
  const lines = output.split('\n');
  
  const regexPatterns = {
    image: /Row: \d+ _id=(?<_id>[^,]+),\s+_data=(?<_data>[^,]+),\s+mime_type=(?<mime_type>[^,]+),\s+_size=(?<_size>[^,]+),\s+_display_name=(?<_display_name>[^,]+),\s+width=(?<width>[^,]+),\s+height=(?<height>[^,]+),\s+date_added=(?<date_added>[^,]+)/,
    audio: /Row: \d+ _id=(?<_id>[^,]+),\s+_data=(?<_data>[^,]+),\s+mime_type=(?<mime_type>[^,]+),\s+_size=(?<_size>[^,]+),\s+_display_name=(?<_display_name>[^,]+),\s+date_added=(?<date_added>[^,]+)/,
    document: /Row: \d+ _id=(?<_id>[^,]+),\s+_data=(?<_data>[^,]+),\s+mime_type=(?<mime_type>[^,]+),\s+_size=(?<_size>[^,]+),\s+_display_name=(?<_display_name>[^,]+),\s+date_added=(?<date_added>[^,]+)/
  };
  
  const regex = regexPatterns[type] || regexPatterns.image;
  
  for (const line of lines) {
    const match = line.match(regex);
    if (!match) continue;
    
    try {
      const item = match.groups;
      
      // 转换数值类型字段
      const intFields = ['_id', '_size'];
      if (type === 'image') intFields.push('width', 'height');
      
      for (const field of intFields) {
        if (item[field]) item[field] = parseInt(item[field], 10);
      }
      
      // 处理显示名称
      if (item._display_name === 'NULL') {
        item._display_name = path.basename(item._data);
      }
      
      // 添加路径信息
      item.path = path.dirname(item._data) + '/';
      
      result.push(item);
    } catch (e) {
      logger.warn(`解析行失败: ${line} - ${e.message}`);
    }
  }
  
  logger.info(`成功解析 ${result.length} 个${type}条目`);
  return result;
};

// 获取媒体列表
const getMediaList = async (deviceId, mediaType) => {
  const uriMap = {
    image: 'content://media/external/images/media',
    video: 'content://media/external/video/media',
    audio: 'content://media/external/audio/media'
  };
  
  const projectionMap = {
    image: '_id:_data:mime_type:_size:_display_name:width:height:date_added',
    video: '_id:_data:mime_type:_size:_display_name:width:height:date_added',
    audio: '_id:_data:mime_type:_size:_display_name:date_added'
  };
  
  const uri = uriMap[mediaType];
  const projection = projectionMap[mediaType];
  
  if (!uri || !projection) {
    throw new Error(`不支持的媒体类型: ${mediaType}`);
  }
  
  const adbCommand = [
    'shell', 'content', 'query',
    '--uri', uri,
    '--projection', projection
  ];
  
  const { stdout } = await runAdbCommand(adbCommand, deviceId);
  return parseAdbOutput(stdout, mediaType);
};

// API路由
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'templates', 'device_connect.html'));
});

app.get('/index.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'templates', 'index.html'));
});

app.get('/api/file', deviceIdRequired, async (req, res) => {
  const { deviceId } = req;
  const { file_path, category, file_name } = req.query;
  
  if (!file_path || !category || !file_name) {
    return res.status(400).json({ 
      error: 'Missing required parameters: file_path, category, file_name' 
    });
  }
  
  const targetDir = path.join(STORAGE_DIR, deviceId, category);
  ensureDirectory(targetDir);
  
  const localFile = path.join(targetDir, file_name);
  
  // 如果文件不存在，尝试从设备拉取
  if (!fs.existsSync(localFile)) {
    const { success, message } = await pullFileFromDevice(deviceId, file_path, localFile);
    if (!success) {
      return res.status(500).json({ 
        error: 'File transfer failed', 
        details: message 
      });
    }
    
    // 再次验证是否拉取成功
    if (!fs.existsSync(localFile)) {
      return res.status(404).json({ 
        error: 'File not found after transfer attempt', 
        details: message 
      });
    }
  }
  
  // 返回文件
  // res.download(localFile, file_name, (err) => {
  //   if (err) {
  //     logger.error(`发送文件失败: ${err.message}`);
  //     res.status(500).json({ error: `Failed to send file: ${err.message}` });
  //   }
  // });
  res.sendFile(localFile, {
    headers: {
      "Content-Disposition": `attachment; filename=${encodeURIComponent(file_name)}`
    },
    dotfiles: "deny"
  }, (err) => {
    if (err) {
      if (!res.headersSent) {
        res.status(500).json({ error: err.message });
      } else {
        logger.error("传输中断:", err.message);
      }
    }
  });
});

app.get('/api/thumbnail', deviceIdRequired, async (req, res) => {
  const { deviceId } = req;
  const { file_path, category, file_name } = req.query;
  
  if (!file_path || !category || !file_name) {
    return res.status(400).json({ 
      error: 'Missing required parameters: file_path, category, file_name' 
    });
  }
  
  const targetDir = path.join(STORAGE_DIR, deviceId, category);
  ensureDirectory(targetDir);
  
  const localFile = path.join(targetDir, file_name);
  
  // 如果文件不存在，尝试从设备拉取
  if (!fs.existsSync(localFile)) {
    const { success, message } = await pullFileFromDevice(deviceId, file_path, localFile);
    if (!success) {
      return res.status(500).json({ 
        error: 'File transfer failed', 
        details: message 
      });
    }
    
    // 再次验证是否拉取成功
    if (!fs.existsSync(localFile)) {
      return res.status(404).json({ 
        error: 'File not found after transfer attempt', 
        details: message 
      });
    }
  }
  
  try {
    const thumbPath = await generateThumbnail(localFile);
    if (!thumbPath) {
      return res.status(500).json({ error: 'Thumbnail generation failed' });
    }
    
    // 设置缓存头
    res.set('Cache-Control', 'public, max-age=86400');
    res.sendFile(thumbPath);
  } catch (err) {
    logger.error(`发送缩略图失败: ${err.message}`);
    res.status(500).json({ error: `Failed to send thumbnail: ${err.message}` });
  }
});

app.get('/api/get_images', deviceIdRequired, async (req, res) => {
  try {
    const { deviceId } = req;
    const images = await getMediaList(deviceId, 'image');
    res.json(images);
  } catch (err) {
    logger.error(`获取图像失败: ${err.message}`);
    res.status(500).json({ 
      error: "ADB命令执行失败", 
      details: err.message 
    });
  }
});

app.get('/api/get_videos', deviceIdRequired, async (req, res) => {
  try {
    const { deviceId } = req;
    const videos = await getMediaList(deviceId, 'video');
    res.json(videos);
  } catch (err) {
    logger.error(`获取视频失败: ${err.message}`);
    res.status(500).json({ 
      error: "ADB命令执行失败", 
      details: err.message 
    });
  }
});

app.get('/api/get_audios', deviceIdRequired, async (req, res) => {
  try {
    const { deviceId } = req;
    const audios = await getMediaList(deviceId, 'audio');
    res.json(audios);
  } catch (err) {
    logger.error(`获取音频失败: ${err.message}`);
    res.status(500).json({ 
      error: "ADB命令执行失败", 
      details: err.message 
    });
  }
});

app.get('/api/get_documents', deviceIdRequired, async (req, res) => {
  const { deviceId } = req;
  const documentType = req.query.document_type || 'document';
  
  let suffixRegex;
  switch (documentType) {
    case 'zip':
      suffixRegex = "'\\.(zip|rar|7z|tar|gz)'";
      break;
    case 'apk':
      suffixRegex = "'\\.(apk)'";
      break;
    default:
      suffixRegex = "'\\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|odt|ods|odp)'";
  }
  
  try {
    const adbCommand = [
      'shell', 
      `content query --uri content://media/external/file --projection _id:_data:mime_type:_size:_display_name:date_added | grep -E ${suffixRegex}`
    ];
    
    const { stdout } = await runAdbCommand(adbCommand, deviceId);
    const documents = parseAdbOutput(stdout, 'document');
    res.json(documents);
  } catch (err) {
    logger.error(`获取文档失败: ${err.message}`);
    res.status(500).json({ 
      error: "ADB命令执行失败", 
      details: err.message 
    });
  }
});

app.get('/api/get_files', deviceIdRequired, async (req, res) => {
  const { deviceId } = req;
  let pathParam = req.query.path || '/sdcard/';
  
  // 确保路径以斜杠结尾
  if (!pathParam.endsWith('/')) {
    pathParam += '/';
  }
  
  try {
    const adbCommand = [
      'shell', "ls", "-lh", `'${pathParam}'`
    ];
    
    const { stdout } = await runAdbCommand(adbCommand, deviceId);
    const files = parseLsOutput(stdout, pathParam);
    res.json(files);
  } catch (err) {
    logger.error(`获取文件失败: ${err.message}`);
    res.status(500).json({ 
      error: "ADB命令执行失败", 
      details: err.message 
    });
  }
});

app.get('/screenshot/:deviceId', async (req, res) => {
  const { deviceId } = req.params;
  
  try {
    const command = `adb -s ${deviceId} exec-out screencap -p`;
    
    const child = spawn('adb', [
      '-s', deviceId, 
      'exec-out', 'screencap', '-p'
    ]);
    
    res.set('Content-Type', 'image/png');
    
    child.stdout.pipe(res);
    
    child.on('error', (err) => {
      logger.error(`ADB错误: ${err.message}`);
      res.status(500).send(`ADB Error: ${err.message}`);
    });
    
    child.on('close', (code) => {
      if (code !== 0) {
        logger.error(`ADB命令失败，退出码: ${code}`);
        res.status(500).send('ADB command failed');
      }
    });
    
    // 设置超时
    setTimeout(() => {
      if (!res.headersSent) {
        child.kill();
        res.status(504).send('ADB command timed out');
      }
    }, 10000);
    
  } catch (err) {
    logger.error(`获取截图失败: ${err.message}`);
    res.status(500).send(`Unexpected error: ${err.message}`);
  }
});

// 设备信息功能
const getDeviceName = async (deviceId) => {
  try {
    const { stdout } = await runAdbCommand('shell getprop ro.product.model', deviceId);
    return stdout.trim();
  } catch (err) {
    logger.error(`获取设备名称失败: ${err.message}`);
    return 'Unknown Device';
  }
};

const getStorageInfo = async (deviceId) => {
  try {
    const { stdout } = await runAdbCommand('shell df /data', deviceId);
    const lines = stdout.trim().split('\n');
    
    if (lines.length < 2) {
      throw new Error("存储信息格式错误");
    }
    
    const parts = lines[lines.length - 1].split(/\s+/);
    if (parts.length < 5) {
      throw new Error("存储信息格式错误");
    }
    
    // 转换为GB
    const totalKb = parseInt(parts[1], 10);
    const usedKb = parseInt(parts[2], 10);
    
    const totalGb = Math.round(totalKb / (1024 * 1024) * 100) / 100;
    const usedGb = Math.round(usedKb / (1024 * 1024) * 100) / 100;
    
    return { total: totalGb, used: usedGb };
  } catch (err) {
    logger.error(`获取存储信息失败: ${err.message}`);
    return { total: 0, used: 0 };
  }
};

const getBatteryLevel = async (deviceId) => {
  try {
    const { stdout } = await runAdbCommand('shell dumpsys battery', deviceId);
    const match = stdout.match(/level:\s*(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  } catch (err) {
    logger.error(`获取电池电量失败: ${err.message}`);
    return 0;
  }
};

app.post('/api/device_info', deviceIdRequired, async (req, res) => {
  try {
    const { deviceId } = req;
    
    const [deviceName, storageInfo, batteryLevel] = await Promise.all([
      getDeviceName(deviceId),
      getStorageInfo(deviceId),
      getBatteryLevel(deviceId)
    ]);
    
    res.json({
      cover_img: `/screenshot/${deviceId}`,
      phone_name: deviceName,
      storage_total_size: storageInfo.total,
      storage_use_size: storageInfo.used,
      battery_use: batteryLevel
    });
  } catch (err) {
    logger.error(`获取设备信息失败: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

const getAdbDevices = async () => {
  try {
    const { stdout } = await runAdbCommand('devices');
    const lines = stdout.trim().split('\n');
    const devices = [];
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line && line.endsWith('device')) {
        const parts = line.split(/\s+/);
        if (parts.length > 0) {
          devices.push(parts[0]);
        }
      }
    }
    
    return { connected: devices.length > 0, devices };
  } catch (err) {
    logger.error(`获取ADB设备失败: ${err.message}`);
    return { connected: false, devices: [] };
  }
};

app.get('/api/get_device', async (req, res) => {
  try {
    const devices = await getAdbDevices();
    res.json(devices);
  } catch (err) {
    res.status(500).json({ 
      connected: false, 
      error: err.message 
    });
  }
});

// 启动前检查
// const verifyInstallation = async (tool) => {
//   return new Promise((resolve) => {
//     exec(`${tool} --version`, (error, stdout, stderr) => {
//       if (error) {
//         resolve({ success: false, message: `${tool} not found` });
//       } else {
//         resolve({ success: true, message: stdout.trim() });
//       }
//     });
//   });
// };

// const installAdb = async () => {
//   // 在实际应用中，这里应该包含安装ADB的逻辑
//   // 由于平台差异，这里仅作为示例
//   return { success: false, message: 'ADB installation not implemented' };
// };

// const installFfmpeg = async () => {
//   // 在实际应用中，这里应该包含安装FFmpeg的逻辑
//   return { success: false, message: 'FFmpeg installation not implemented' };
// };

// 启动服务器
const startServer = async () => {
  // 确保存储目录存在
  ensureDirectory(STORAGE_DIR);
  ensureDirectory(CACHE_DIR);
  
  // 验证必要工具
  const tools = [
    { name: 'adb', installer: installAdb },
    { name: 'ffmpeg', installer: installFfmpeg }
  ];
  
  for (const tool of tools) {
    const { success, message } = await verifyInstallation(tool.name);
    logger.info(`${tool.name}验证结果: ${success}, 信息: ${message}`);
    
    if (!success) {
      const { success: installSuccess, message: installMessage } = await tool.installer();
      logger.info(`${tool.name}安装结果: ${installSuccess}, 信息: ${installMessage}`);
    }
  }
  
  app.listen(PORT, () => {
    logger.info(`服务器运行在 http://0.0.0.0:${PORT}`);
    logger.info(`存储目录: ${STORAGE_DIR}`);
  });
};

startServer().catch(err => {
  logger.error(`服务器启动失败: ${err.message}`);
  process.exit(1);
});