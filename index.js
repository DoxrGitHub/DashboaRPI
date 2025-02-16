const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const pty = require('node-pty');
const fs = require("fs");
const os = require('os');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');

var convert = require('convert-seconds');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

let conf = fs.readFileSync("drpi.conf", "utf-8");
let PORT = parseInt(conf.split("\n")[1].replace("PORT=", ""));
let PASSWORD = conf.split("\n")[0].replace("PASSWORD=", "");

app.use(express.static('pub'));
app.use(cookieParser());

function hashPassword(password) {
  return crypto.createHmac('sha256', PASSWORD).update(password).digest('hex');
}

app.use((req, res, next) => {
  if (req.cookies.loggedIn && req.cookies.loggedIn === hashPassword('loggedIn')) {
    return next();
  }
  if (req.path !== '/login') {
    return res.redirect('/login');
  }
  next();
});

app.get('/login', (req, res) => {
  res.sendFile(__dirname + '/pub/login.html');
});

app.post('/login', express.urlencoded({ extended: true }), (req, res) => {
  if (req.body.password === PASSWORD) {
    res.cookie('loggedIn', hashPassword('loggedIn'), { maxAge: 365 * 24 * 60 * 60 * 1000 });
    return res.redirect('/');
  }
  res.status(401).send('Invalid creds');
});

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/pub/main.html');
});

async function getCPUUsage() {
  const measure = () => {
    const cpus = os.cpus();
    let idle = 0, total = 0;

    cpus.forEach(core => {
      for (let type in core.times) {
        total += core.times[type];
      }
      idle += core.times.idle;
    });

    return { idle, total };
  };

  const start = measure();
  await new Promise(resolve => setTimeout(resolve, 1000));
  const end = measure();

  const idleDiff = end.idle - start.idle;
  const totalDiff = end.total - start.total;
  const usage = 100 - (100 * idleDiff / totalDiff);

  return usage.toFixed(2);
}

async function getIP(version) {
  try {
    const response = await fetch(`https://api${version === 6 ? '64' : ''}.ipify.org?format=json`);
    const data = await response.json();
    return data.ip;
  } catch (error) {
    throw error;
  }
}

function getInternalIP() {
  const interfaces = os.networkInterfaces();
  for (const interfaceName in interfaces) {
    for (const iface of interfaces[interfaceName]) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "No internal IP found";
}

app.get("/data", async (req, res) => {
  let craftedDataset = {
    uptime: "",
    crafted: Date.now(),
    memory: {
      used: `${Math.floor(process.memoryUsage().rss / 1024 / 1024)} MB`,
      total: `${Math.floor(os.totalmem() / 1024 / 1024)} MB`
    },
    hostname: os.hostname(),
    CPUUsage: "",
    ip: {
      v4: "",
      v6: "",
      local: ""
    },
    thermal: 0
  }

  let uptimefile = fs.readFileSync("/proc/uptime", "utf8");
  uptimefile = uptimefile.split(" ");
  let uptime = uptimefile[0];
  uptime = convert(uptime);

  let wording = {
    hours: "hours",
    minutes: "minutes",
    seconds: "seconds"
  };
  if (uptime.hours == 1) wording.hours = "hour";
  else if (uptime.minutes == 1) wording.minutes = "minute";
  else if (uptime.seconds == 1) wording.seconds = "second";

  craftedDataset.uptime = `${uptime.hours} ${wording.hours}, ${uptime.minutes} ${wording.minutes}, and ${uptime.seconds} ${wording.seconds}.`;

  let cpuUsage = await getCPUUsage();
  craftedDataset.CPUUsage = cpuUsage;

  const [ipv4, ipv6] = await Promise.all([getIP(4), getIP(6)]);
  craftedDataset.ip.v4 = ipv4;
  if (ipv4 !== ipv6) {
    craftedDataset.ip.v6 = ipv6;
  } else {
    craftedDataset.ip.v6 = "[unsupported]";
  }

  craftedDataset.ip.local = getInternalIP();
  try {
    let thermalfile = fs.readFileSync("cat/sys/class/thermal/thermal_zone0/temp", "utf-8");
    thermalfile = parseInt(thermalfile) / 1000;
    craftedDataset.thermal = thermalfile;
  } catch {
    craftedDataset.thermal = -1;
  }

  res.json(craftedDataset);
});

io.on('connection', (socket) => {
  console.log('Client connected: ' + socket.id);
  const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
  if (typeof socket.handshake.headers["cookie"] !== "string") {
    socket.disconnect(true);
  } else if (socket.handshake.headers["cookie"].replace("loggedIn=", "") !== hashPassword("loggedIn")) {
      console.log(hashPassword("loggedIn"))
      socket.disconnect(true);
  }
  
  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-color',
    cols: 80,
    rows: 30,
    cwd: process.env.HOME,
    env: process.env,
  });

  ptyProcess.on('data', (data) => {
    socket.emit('output', data);
  });

  socket.on('input', (data) => {
    ptyProcess.write(data);
  });

  socket.on('resize', (data) => {
    ptyProcess.resize(data.cols, data.rows);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected: ' + socket.id);
    ptyProcess.kill();
  });
});

server.listen(PORT, () => {
  console.log(`DashboaRPI running on ${PORT}`);
});
