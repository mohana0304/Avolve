const primary = "#5C2D90";
const primaryLight = "#9854CB";
const primaryPale = "#f6edfd";
const warning = "#f59e0b";
let dashboardData = {};
let tooltipData = {};

$(document).ready(function () {
  loadCardsData();
  loadPurchaseData();
  loadMileageData();
  loadInspectionChartData();
  loadCTAData();
  loadInspectionHistoryData();
  bindTooltips();
});

function fakeApi(jsonPath, delay) {
  return new Promise(function (resolve, reject) {
    setTimeout(function () {
      $.getJSON(jsonPath)
        .done(resolve)
        .fail(reject);
    }, delay);
  });
}

function loadCardsData() {
  fakeApi("./data/cards.json", 500).then(function (data) {
    dashboardData.cards = data;
    $("#activeTyres").text(data.activeTyresRunning);
    $("#under4mm").text(data.tyresUnder4mm);
    $("#avgDays").text(data.avgTyreRunningDays);
    $("#vehicles").text(data.vehicleEnrolled);
    $("#vehicleTyresMapped").text(data.vehicleTyresMapped);
    $("#retreadabilityPercentage").text(data.retreadabilityPercentage + "%");
  });
}

function loadPurchaseData() {
  $("#purchaseDonut").html("<p class='loading'>Loading...</p>");
  $("#purchaseLine").html("<p class='loading'>Loading...</p>");
  fakeApi("./data/purchase.json", 1500).then(function (data) {
    dashboardData.tyresPurchase = data;
    renderPurchaseBar();
    renderPurchaseLine();
  });
}

function loadMileageData() {
  $("#mileageArea").html("<p class='loading'>Loading...</p>");
  $("#durabilityPie").html("<p class='loading'>Loading...</p>");
  fakeApi("./data/mileage.json", 2500).then(function (data) {
    dashboardData.tyreHealthPerformance = data;
    renderMileageArea();
    renderDurabilityPie();
  });
}

function loadInspectionChartData() {
  $("#ipBar").html("<p class='loading'>Loading...</p>");
  $("#wearBar").html("<p class='loading'>Loading...</p>");
  fakeApi("./data/inspection-chart.json", 3000).then(function (data) {
    dashboardData.inspection = data;
    renderIPBar();
    renderWearBar();
  });
}

function loadCTAData() {
  $("#ctaTable").html(`
    <tr>
      <td colspan="6" class="empty-row">Loading call to action...</td>
    </tr>
  `);
  fakeApi("./data/call-to-action.json", 1800).then(function (data) {
    dashboardData.callToAction = data;
    renderCTATable();
  });
}

function loadInspectionHistoryData() {
  $("#inspectionVehicleTable").html(`
    <tr>
      <td colspan="10" class="empty-row">Loading inspection history...</td>
    </tr>
  `);
  fakeApi("./data/inspection-history.json", 3500).then(function (data) {
    dashboardData.inspectionHistory = data;
    renderVehicleInspectionHistory();
  });
}

function renderPurchaseBar() {
  const data = dashboardData.tyresPurchase.purchaseVsCommitment;
  $("#purchaseDonut").html("");
  $.plot("#purchaseDonut", [
    {
      label: "Purchased",
      data: [[data.purchased, 0]],
      color: primary,
      bars: { show: true, horizontal: true, barWidth: 0.4, align: "center" }
    },
    {
      label: "Commitment",
      data: [[data.commitment, 1]],
      color: warning,
      bars: { show: true, horizontal: true, barWidth: 0.4, align: "center" }
    }
  ], {
    xaxis: { min: 0 },
    yaxis: {
      ticks: [[0, "Purchased"], [1, "Commitment"]],
      min: -0.5,
      max: 1.5
    },
    legend: { show: false },
    grid: {
      borderColor: "#e2e8f0",
      hoverable: true,
      clickable: true,
      margin: { top: 30, right: 35, bottom: 40, left: 100 }
    }
  });

  tooltipData.purchaseDonut = data;
  $("#purchaseDonut").next(".custom-legend").remove();
  $("#purchaseDonut").after(`
    <div class="custom-legend">
      <span><b class="legend-box purchase"></b> Purchased</span>
      <span><b class="legend-box target"></b> Commitment</span>
    </div>
  `);
}

function renderPurchaseLine() {
  const months = [];
  dashboardData.tyresPurchase.quarterWisePurchase.forEach(function (quarter) {
    quarter.months.forEach(function (item) {
      months.push(item);
    });
  });
  const purchaseData = months.map((item, index) => [index, item.purchase]);
  const targetData = months.map((item, index) => [index, item.target]);
  const ticks = months.map((item, index) => [index, item.month]);
  $("#purchaseLine").html("");
  $.plot("#purchaseLine", [
    {
      label: "Purchase",
      data: purchaseData,
      color: primary,
      lines: { show: true, lineWidth: 3 },
      points: { show: true, radius: 5, fillColor: "#ffffff" }
    },
    {
      label: "Target",
      data: targetData,
      color: warning,
      lines: { show: true, lineWidth: 3 },
      points: { show: true, radius: 4, fillColor: "#ffffff" }
    }
  ], {
    xaxis: { ticks: ticks, min: -0.5, max: months.length - 0.5 },
    yaxis: { min: 200, max: 400 },
    legend: { show: false },
    grid: {
      borderColor: "#e2e8f0",
      hoverable: true,
      clickable: true,
      margin: { top: 30, right: 35, bottom: 55, left: 65 }
    }
  });
  tooltipData.purchaseLine = months;
  $("#purchaseLine").next(".custom-legend").remove();
  $("#purchaseLine").after(`
    <div class="custom-legend">
      <span><b class="legend-box purchase"></b> Purchase</span>
      <span><b class="legend-box target"></b> Target</span>
    </div>
  `);
}

function renderMileageArea() {
  const mileage = dashboardData.tyreHealthPerformance.avgTyreMileageNew;
  const mileageData = mileage.map((item, index) => [index, item.mileage]);
  const ticks = mileage.map((item, index) => [index, item.month]);
  $("#mileageArea").html("");
  $.plot("#mileageArea", [
    {
      label: "Mileage",
      data: mileageData,
      color: primaryLight,
      lines: {
        show: true,
        fill: true,
        lineWidth: 3,
        fillColor: primaryPale
      },
      points: { show: true, radius: 4, fillColor: "#ffffff" }
    }
  ], {
    xaxis: { ticks: ticks, min: -0.5, max: mileage.length - 0.5 },
    yaxis: { min: 35000 },
    legend: { show: false },
    grid: {
      borderColor: "#e2e8f0",
      hoverable: true,
      clickable: true,
      margin: { top: 30, right: 35, bottom: 55, left: 75 }
    }
  });
  tooltipData.mileageArea = mileage;
}

function renderDurabilityPie() {
  const durability = dashboardData.tyreHealthPerformance.durabilityFactor;
  const balance = 100 - durability;
  $("#durabilityPie").html("");
  $.plot("#durabilityPie", [
    { label: "Durability", data: durability, color: primary },
    { label: "Balance", data: balance, color: "#999b9e" }
  ], {
    series: {
      pie: {
        show: true,
        radius: 0.72,
        innerRadius: 0.58,
        label: { show: true, radius: 0.82 }
      }
    },
    legend: { show: true, position: "se", backgroundOpacity: 0 },
    grid: { hoverable: true, clickable: true }
  });

  tooltipData.durabilityPie = {
    title: "Durability Factor",
    durability: durability,
    balance: balance
  };
}

function renderIPBar() {
  const ip = dashboardData.inspection.monthlyIPVariation;
  const data = ip.map((item, index) => [index, item.inspectionPercentage]);
  const ticks = ip.map((item, index) => [index, item.month]);
  $("#ipBar").html("");
  $.plot("#ipBar", [
    {
      label: "Inspection %",
      data: data,
      color: primary,
      bars: { show: true, barWidth: 0.45, align: "center" }
    }
  ], {
    xaxis: { ticks: ticks, min: -0.5, max: ip.length - 0.5 },
    yaxis: { min: 0, max: 100 },
    legend: { show: false },
    grid: {
      borderColor: "#e2e8f0",
      hoverable: true,
      clickable: true,
      margin: { top: 30, right: 35, bottom: 55, left: 65 }
    }
  });
  tooltipData.ipBar = ip;
}

function renderWearBar() {
  const wear = dashboardData.inspection.topWearPatterns;
  const data = wear.map((item, index) => [index, item.vehiclesAffected]);
  const ticks = wear.map((item, index) => [index, item.pattern]);
  $("#wearBar").html("");
  $.plot("#wearBar", [
    {
      label: "Vehicles Affected",
      data: data,
      color: primaryLight,
      bars: { show: true, barWidth: 0.45, align: "center" }
    }
  ], {
    xaxis: { ticks: ticks, min: -0.5, max: wear.length - 0.5 },
    yaxis: { min: 0 },
    legend: { show: false },
    grid: {
      borderColor: "#e2e8f0",
      hoverable: true,
      clickable: true,
      margin: { top: 30, right: 35, bottom: 90, left: 65 }
    }
  });
  tooltipData.wearBar = wear;
}

function renderVehicleInspectionHistory() {
  showInspectionVehicles("last7Days");
}

function getFilteredVehicles(period) {
  const vehicles = dashboardData.inspectionHistory || [];
  if (vehicles.length === 0) return [];
  const latestDate = new Date(
    Math.max(...vehicles.map(v => new Date(v.date)))
  );
  let days = 7;
  if (period === "last15Days") days = 15;
  else if (period === "last1M") days = 30;
  else if (period === "last3M") days = 90;
  else if (period === "last6M") days = 180;
  const fromDate = new Date(latestDate);
  fromDate.setDate(latestDate.getDate() - days);
  return vehicles.filter(function (item) {
    const itemDate = new Date(item.date);
    return itemDate >= fromDate && itemDate <= latestDate;
  });
}

function showInspectionVehicles(period) {
  $(".history-buttons button").removeClass("active");
  $(`button[onclick="showInspectionVehicles('${period}')"]`).addClass("active");
  const vehicles = getFilteredVehicles(period);
  let html = "";
  if (vehicles.length === 0) {
    html = `
      <tr>
        <td colspan="10" class="empty-row">
          No vehicle inspection data found
        </td>
      </tr>
    `;
    $("#inspectionVehicleTable").html(html);
    return;
  }
  vehicles.forEach(function (item) {
    html += `
      <tr>
        <td>${item.vehicle}</td>
        <td>${item.wheeler}</td>
        <td>${item.config}</td>
        <td>${item.name}</td>
        <td>${formatDate(item.date)}</td>
        <td>${item.allTyreInspected ? "Yes" : "No"}</td>
        <td>${item.odometer}</td>
        <td>${item.workshop}</td>
        <td>${item.resetOdo ? "Yes" : "No"}</td>
        <td>${item.notOperOdo ? "Yes" : "No"}</td>
      </tr>
    `;
  });
  $("#inspectionVehicleTable").html(html);
}

function renderCTATable() {
  let html = "";
  dashboardData.callToAction.forEach(function (item, index) {
    const cls = item.priority.toLowerCase();
    html += `
      <tr>
        <td>${item.wearPattern}</td>
        <td>${item.affectedTyres}</td>
        <td>${item.affectedVehicles}</td>
        <td class="${cls}">${item.priority}</td>
        <td>${item.recommendedAction}</td>
        <td>
          <button class="download-btn-small" onclick="downloadSingleReport(${index})">
            Download
          </button>
        </td>
      </tr>
    `;
  });
  $("#ctaTable").html(html);
}

function formatDate(dateValue) {
  const date = new Date(dateValue);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function bindTooltips() {
  const tooltip = $("#tooltip");
  $(".chart").bind("plothover", function (event, pos, item) {
    if (item) {
      const chartId = $(this).attr("id");
      const html = getTooltipContent(chartId, item);
      tooltip.html(html).css({
        top: pos.pageY + 12,
        left: pos.pageX + 12,
        position: "absolute"
      }).fadeIn(100);
    } else {
      tooltip.hide();
    }
  });
}

function getTooltipContent(chartId, item) {
  const xIndex = Math.round(item.datapoint[0]);
  if (chartId === "purchaseDonut") {
    const data = tooltipData.purchaseDonut;
    return `
      <strong>Purchase vs Commitment</strong><br>
      ${item.series.label}: ${item.datapoint[0]} tyres<br>
      Purchased: ${data.purchased}<br>
      Commitment: ${data.commitment}<br>
      Achievement: ${data.achievementPercentage}%
    `;
  }
  if (chartId === "purchaseLine") {
    const data = tooltipData.purchaseLine[xIndex];
    return `
      <strong>${item.series.label}</strong><br>
      Month: ${data.month}<br>
      Purchase: ${data.purchase}<br>
      Target: ${data.target}<br>
      Achievement: ${data.percentage}%
    `;
  }
  if (chartId === "mileageArea") {
    const data = tooltipData.mileageArea[xIndex];
    return `
      <strong>Average Tyre Mileage</strong><br>
      Month: ${data.month}<br>
      Mileage: ${data.mileage.toLocaleString()} km
    `;
  }
  if (chartId === "ipBar") {
    const data = tooltipData.ipBar[xIndex];
    return `
      <strong>Monthly IP Variation</strong><br>
      Month: ${data.month}<br>
      Inspection: ${data.inspectionPercentage}%
    `;
  }
  if (chartId === "wearBar") {
    const data = tooltipData.wearBar[xIndex];
    return `
      <strong>${data.pattern}</strong><br>
      Vehicles Affected: ${data.vehiclesAffected}<br>
      Severity: ${data.severity}<br>
      Action: ${data.recommendedAction}
    `;
  }
  if (chartId === "durabilityPie") {
    return `
      <strong>Durability Factor</strong><br>
      ${item.series.label}: ${item.series.data[0][1]}%
    `;
  }
  return "";
}
function downloadSingleReport(index) {
  const item = dashboardData.callToAction[index];
  const csv = `Wear Pattern,Affected Tyres,Affected Vehicles,Priority,Recommended Action
${item.wearPattern},${item.affectedTyres},${item.affectedVehicles},${item.priority},${item.recommendedAction}`;
  downloadCSV(csv, item.wearPattern.replace(/\s/g, "_") + "_report.csv");
}
function downloadAllReports() {
  if (!dashboardData.callToAction) {
    alert("Call to action data is still loading");
    return;
  }
  let csv = "Wear Pattern,Affected Tyres,Affected Vehicles,Priority,Recommended Action\n";
  dashboardData.callToAction.forEach(function (item) {
    csv += `${item.wearPattern},${item.affectedTyres},${item.affectedVehicles},${item.priority},${item.recommendedAction}\n`;
  });
  downloadCSV(csv, "call_to_action_report.csv");
}
function downloadCSV(csv, filename) {
  const blob = new Blob([csv], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}