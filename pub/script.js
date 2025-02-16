

fetch("/data")
.then(data => data.json())
.then(systemdata => {
  document.getElementById("uptime").innerText = systemdata.uptime
  document.getElementById("last-updated").innerText = new Date(systemdata.crafted).toLocaleString()

  document.getElementById("used").innerText = systemdata.memory.used
  document.getElementById("total").innerText = systemdata.memory.total

  let total = systemdata.memory.total.replace(" MB", "")
  let used = systemdata.memory.used.replace(" MB", "")

  document.getElementById("memory-bar").value = used;
  document.getElementById("memory-bar").max = total;

  document.getElementById("hostname-footer").innerText = systemdata.hostname;

  document.getElementById("cpu-usage").innerText = systemdata.CPUUsage + "%";
  document.getElementById("cpu-bar").value = systemdata.CPUUsage;
  document.getElementById("cpu-bar").max = 100;

  document.getElementById("ipv4").innerText = systemdata.ip.v4
  document.getElementById("ipv6").innerText = systemdata.ip.v6
  document.getElementById("internal").innerText = systemdata.ip.local

  if (systemdata.thermal !== -1) {
    document.getElementById("temperature").innerText = systemdata.thermal + "°C"
    document.getElementById("tempF").innerText = ", " +  ((systemdata.thermal * 9)/5 + 32) + "°F"
  } else {
    document.getElementById("temperature").innerText = "[unsupported]"
  }

  let loader = document.getElementById("loader");
  loader.style.opacity = "0";
  
  setTimeout(() => {
    loader.style.visibility = "hidden";
    loader.style.display = "none";
    document.getElementById("content").style.display = "block";
  }, 500);
});
