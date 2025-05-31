document.addEventListener('DOMContentLoaded', function () {
    const connectBtn = document.getElementById('connectBtn');
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');

    // 设备信息元素
    const deviceName = document.getElementById('deviceName');
    const deviceSerial = document.getElementById('deviceSerial');
    const storageInfo = document.getElementById('storageInfo');
    const storageFill = document.getElementById('storageFill');
    const batteryStatus = document.getElementById('batteryStatus');
    const batteryFill = document.getElementById('batteryFill');
    const batteryPercent = document.getElementById('batteryPercent');
    const phoneCover = document.getElementById('phone-image');

    // 初始状态
    let deviceConnected = false;
    let checkCount = 0;

    let serial_id = '';

    function get_device_info() {
        fetch('/api/device_info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 'id': serial_id })
        })
            .then(response => response.json())
            .then(data => {
                // 使用解构赋值一次性获取所有需要的数据
                const { phone_name, cover_img, storage_use_size, storage_total_size, battery_use } = data;

                deviceName.textContent = phone_name;

                const total = storage_total_size;
                const used = storage_use_size;
                const percentage = Math.min(100, Math.round((used / total) * 100));
                storageInfo.textContent = `已用: ${used}GB / 可用: ${total}GB`;
                storageFill.style.width = `${percentage}%`;
                phoneCover.src = cover_img;
                updateBatteryDisplay(battery_use);

                deviceConnected = true;

                // 更新按钮状态
                connectBtn.textContent = "访问设备";
                connectBtn.classList.add("active");
                connectBtn.disabled = false;

                connectBtn.addEventListener('click', function () {
                    window.location.href = `/index.html?id=${serial_id}`;
                });

                // 更新状态指示器
                statusDot.classList.add("connected");
                statusText.textContent = "设备已连接";
            });
    }



    // 更新电池显示
    function updateBatteryDisplay(battery_use) {
        const level = battery_use;

        batteryStatus.textContent = `当前电量: ${level}%`;
        batteryFill.style.width = `${level}%`;
        batteryPercent.textContent = `${level}%`;

        // 根据电量改变电池颜色
        if (level <= 20) {
            batteryFill.style.background = 'linear-gradient(to right, #d32f2f, #f44336)';
        } else if (level <= 50) {
            batteryFill.style.background = 'linear-gradient(to right, #ff9800, #ffc107)';
        } else {
            batteryFill.style.background = 'linear-gradient(to right, #2e7d32, #4caf50)';
        }

    }

    // 设备检查函数
    function checkDeviceConnection() {
        fetch('/api/get_device', {
            method: 'GET'
        })
            .then(response => response.json())
            .then(data => {
                if (data.connected) {
                    clearInterval(checkInterval);
                    serial_id = data.devices[0];
                    deviceSerial.textContent = `设备序列号: ${data.serial}`;
                    get_device_info();
                }
            })
    }

    // 初始禁用按钮
    connectBtn.disabled = true;

    // 每1秒检查一次设备
    const checkInterval = setInterval(checkDeviceConnection, 1000);

});