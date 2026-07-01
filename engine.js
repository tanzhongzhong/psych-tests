// ============ TEST ENGINE v2 ============
// Each test page sets CONFIG_FILE before loading this script

let config = null;
let currentQuestion = 0;
let answers = {};
let resultData = null;

async function init() {
  if (typeof CONFIG_FILE === 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const configName = params.get('config') || 'work-energy';
    var cfgPath = 'configs/' + configName + '.json';
  } else {
    var cfgPath = CONFIG_FILE;
  }

  try {
    const resp = await fetch(cfgPath);
    if (!resp.ok) throw new Error('Config not found');
    config = await resp.json();
  } catch(e) {
    try {
      const resp = await fetch('./' + cfgPath);
      if (!resp.ok) throw new Error('Config not found');
      config = await resp.json();
    } catch(e2) {
      document.getElementById('coverPage').innerHTML =
        '<div style="text-align:center;padding:40px;color:#636E72;">' +
        '<div style="font-size:48px;margin-bottom:16px;">😢</div>' +
        '<h2>测试配置加载失败</h2>' +
        '<p style="margin-top:8px;">请检查链接是否正确</p></div>';
      return;
    }
  }

  renderCover();
}

function renderCover() {
  var m = config.meta;
  document.getElementById('coverTitle').textContent = m.title;
  document.getElementById('coverDesc').textContent = m.subtitle;
  document.getElementById('coverEmoji').textContent = m.icon || '🔮';
  document.getElementById('coverBadge').textContent = m.badge || '趣味心理测试';
  document.getElementById('coverQCount').textContent = config.questions.length;
  document.getElementById('coverTime').textContent = m.estimatedTime || '3-5分钟';

  if (m.themeColor) {
    document.documentElement.style.setProperty('--primary', m.themeColor);
  }
  document.title = m.title;
}

function showPage(pageId) {
  var pages = document.querySelectorAll('.page');
  for (var i = 0; i < pages.length; i++) {
    pages[i].classList.remove('active');
  }
  document.getElementById(pageId).classList.add('active');
  window.scrollTo(0, 0);
}

function startTest() {
  currentQuestion = 0;
  answers = {};
  showPage('questionPage');
  renderQuestion();
}

function renderQuestion() {
  var q = config.questions[currentQuestion];
  var total = config.questions.length;

  document.getElementById('progressBar').style.width = (currentQuestion / total * 100) + '%';
  document.getElementById('progressText').textContent = (currentQuestion + 1) + ' / ' + total;
  document.getElementById('questionNumber').textContent = '第 ' + (currentQuestion + 1) + ' 题';
  document.getElementById('questionText').textContent = q.text;

  var optionsList = document.getElementById('optionsList');
  optionsList.innerHTML = '';
  q.options.forEach(function(opt, idx) {
    var btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.textContent = opt.text;
    if (answers[q.id] !== undefined && answers[q.id].index === idx) {
      btn.classList.add('selected');
    }
    btn.onclick = (function(qId, i, score, text) {
      return function() { selectOption(qId, i, score, text); };
    })(q.id, idx, opt.score, opt.text);
    optionsList.appendChild(btn);
  });

  document.getElementById('btnPrev').disabled = currentQuestion === 0;
  var btnNext = document.getElementById('btnNext');
  var isLast = currentQuestion === total - 1;
  btnNext.textContent = isLast ? '✨ 查看结果' : '下一题 →';
  btnNext.className = isLast ? 'btn-next submit' : 'btn-next';
  btnNext.disabled = answers[q.id] === undefined;

  window.scrollTo(0, 0);
}

function selectOption(qId, idx, score, text) {
  answers[qId] = { index: idx, score: score, text: text };

  var buttons = document.querySelectorAll('.option-btn');
  for (var i = 0; i < buttons.length; i++) {
    buttons[i].classList.toggle('selected', i === idx);
  }

  document.getElementById('btnNext').disabled = false;
}

function prevQuestion() {
  if (currentQuestion > 0) {
    currentQuestion--;
    renderQuestion();
  }
}

function nextQuestion() {
  var total = config.questions.length;
  if (currentQuestion < total - 1) {
    currentQuestion++;
    renderQuestion();
  } else {
    calculateAndShowResult();
  }
}

function calculateAndShowResult() {
  showPage('calcPage');

  var dimScores = {};
  for (var i = 0; i < config.dimensions.length; i++) {
    var d = config.dimensions[i];
    dimScores[d.id] = { total: 0, count: 0, max: 0 };
  }

  for (var i = 0; i < config.questions.length; i++) {
    var q = config.questions[i];
    if (answers[q.id]) {
      var dimId = q.dimension || config.dimensions[0].id;
      if (dimScores[dimId]) {
        var maxScore = q.options.length;
        dimScores[dimId].total += answers[q.id].score;
        dimScores[dimId].count++;
        dimScores[dimId].max += maxScore;
      }
    }
  }

  var dimResults = {};
  var dimKeys = Object.keys(dimScores);
  for (var i = 0; i < dimKeys.length; i++) {
    var id = dimKeys[i];
    var d = dimScores[id];
    dimResults[id] = {
      score: d.total,
      max: d.max,
      percentage: d.max > 0 ? Math.round(d.total / d.max * 100) : 0
    };
  }

  var sorted = [];
  var entries = [];
  for (var k in dimResults) {
    if (dimResults.hasOwnProperty(k)) {
      entries.push([k, dimResults[k]]);
    }
  }
  entries.sort(function(a, b) { return a[1].percentage - b[1].percentage; });
  var lowestKey = entries[0][0];
  var secondKey = entries.length > 1 ? entries[1][0] : null;

  var resultType = null;
  for (var i = 0; i < config.results.length; i++) {
    var r = config.results[i];
    if (r.rule) {
      if (r.rule.type === 'all_below') {
        var allBelow = true;
        var ruleDims = Object.keys(r.rule.dimensions);
        for (var j = 0; j < ruleDims.length; j++) {
          var rd = ruleDims[j];
          if (!dimResults[rd] || dimResults[rd].percentage >= r.rule.dimensions[rd]) {
            allBelow = false;
            break;
          }
        }
        if (allBelow) { resultType = r; break; }
      }
      if (r.rule.type === 'dim_below') {
        if (dimResults[r.rule.dimension] && dimResults[r.rule.dimension].percentage < r.rule.threshold) {
          resultType = r; break;
        }
      }
      if (r.rule.type === 'dim_is_lowest') {
        if (lowestKey === r.rule.dimension) {
          resultType = r; break;
        }
      }
    }
  }

  if (!resultType) {
    for (var i = 0; i < config.results.length; i++) {
      var r = config.results[i];
      if (r.dimension) {
        if (Array.isArray(r.dimension)) {
          if (r.dimension.indexOf(lowestKey) >= 0) {
            resultType = r; break;
          }
        } else if (r.dimension === lowestKey) {
          resultType = r; break;
        }
      }
    }
  }

  if (!resultType) {
    resultType = config.results[0];
  }

  resultData = {
    type: resultType,
    dimensions: dimResults,
    dimOrder: entries,
    secondaryKey: secondKey
  };

  setTimeout(function() {
    renderResult();
    showPage('resultPage');
  }, 1500);
}

function renderResult() {
  var r = resultData.type;
  var dims = resultData.dimensions;

  document.getElementById('resultEmoji').textContent = r.emoji || '📊';
  document.getElementById('resultName').textContent = r.name;
  document.getElementById('resultDesc').textContent = r.shortDesc || '';

  var html = '';

  // Score cards
  html += '<div class="score-cards">';
  for (var i = 0; i < config.dimensions.length; i++) {
    var d = config.dimensions[i];
    var data = dims[d.id] || { percentage: 0 };
    html += '<div class="score-card">' +
      '<div class="score-card-label">' + d.name + '</div>' +
      '<div class="score-card-value" style="color:' + d.color + '">' + data.percentage + '%</div>' +
      '<div class="score-card-bar" style="background:' + d.color + ';width:' + data.percentage + '%"></div>' +
    '</div>';
  }
  html += '</div>';

  // Radar chart
  if (config.dimensions.length >= 3) {
    html += '<div class="charts-section">' +
      '<h3>📊 四维能量雷达图</h3>' +
      '<div class="chart-container"><canvas id="radarChart" style="max-height:280px"></canvas></div>' +
    '</div>';
  }

  // Core conclusion
  html += '<div class="report-section"><h3>💡 核心结论</h3>' +
    '<p>' + (r.coreConclusion || r.description || '') + '</p></div>';

  // Deep analysis
  if (r.deepAnalysis) {
    html += '<div class="report-section"><h3>🔍 深度分析</h3>';
    var analysis = Array.isArray(r.deepAnalysis) ? r.deepAnalysis : [r.deepAnalysis];
    for (var i = 0; i < analysis.length; i++) {
      html += '<p>' + analysis[i] + '</p>';
    }
    html += '</div>';
  }

  // Drain sources
  if (r.drainSources && r.drainSources.length > 0) {
    html += '<div class="report-section"><h3>⚠️ 三大消耗来源</h3><div class="tag-list">';
    for (var i = 0; i < r.drainSources.length; i++) {
      html += '<span class="tag tag-danger">' + r.drainSources[i] + '</span>';
    }
    html += '</div></div>';
  }

  // Strengths
  if (r.strengths && r.strengths.length > 0) {
    html += '<div class="report-section"><h3>💪 你的核心优势</h3><div class="tag-list">';
    for (var i = 0; i < r.strengths.length; i++) {
      html += '<span class="tag tag-success">' + r.strengths[i] + '</span>';
    }
    html += '</div></div>';
  }

  // Hidden strength
  if (r.hiddenStrength) {
    html += '<div class="report-section"><h3>🌟 隐藏优势</h3>' +
      '<p>' + r.hiddenStrength + '</p></div>';
  }

  // Blind spots
  if (r.blindSpots && r.blindSpots.length > 0) {
    html += '<div class="report-section"><h3>🕳️ 三个盲区</h3><div class="tag-list">';
    for (var i = 0; i < r.blindSpots.length; i++) {
      html += '<span class="tag tag-warning">' + r.blindSpots[i] + '</span>';
    }
    html += '</div></div>';
  }

  // Risk warning
  if (r.riskWarning) {
    html += '<div class="report-section"><h3>🚨 风险预警</h3>' +
      '<p>' + r.riskWarning + '</p></div>';
  }

  // Comparison
  if (r.noChangeOutcome || r.changeOutcome) {
    html += '<div class="report-section"><h3>📈 未来推演</h3><div class="compare-grid">' +
      '<div class="compare-card bad"><h4>😞 如果维持现状</h4><p>' +
      (r.noChangeOutcome || '问题可能逐渐累积，影响身心健康和生活质量。') + '</p></div>' +
      '<div class="compare-card good"><h4>😊 如果开始改变</h4><p>' +
      (r.changeOutcome || '重新找回生活的掌控感和幸福感。') + '</p></div>' +
    '</div></div>';
  }

  // Action plan
  if (r.actionPlan && r.actionPlan.length > 0) {
    html += '<div class="report-section"><h3>🗓️ 30天行动路线图</h3><ol class="action-plan">';
    for (var i = 0; i < r.actionPlan.length; i++) {
      html += '<li>' + r.actionPlan[i] + '</li>';
    }
    html += '</ol></div>';
  }

  document.getElementById('resultBody').innerHTML = html;

  setTimeout(renderRadarChart, 100);
}

function renderRadarChart() {
  var canvas = document.getElementById('radarChart');
  if (!canvas) return;

  var ctx = canvas.getContext('2d');
  var dims = resultData.dimensions;

  new Chart(ctx, {
    type: 'radar',
    data: {
      labels: config.dimensions.map(function(d) { return d.name; }),
      datasets: [{
        label: '你的得分',
        data: config.dimensions.map(function(d) {
          return (dims[d.id] && dims[d.id].percentage) || 0;
        }),
        backgroundColor: 'rgba(108,92,231,0.15)',
        borderColor: '#6C5CE7',
        borderWidth: 2,
        pointBackgroundColor: '#6C5CE7',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      scales: {
        r: {
          beginAtZero: true,
          max: 100,
          min: 0,
          ticks: { stepSize: 20, display: false },
          pointLabels: { font: { size: 13, weight: '600' }, color: '#2D3436' },
          grid: { color: 'rgba(108,92,231,0.08)' },
          angleLines: { color: 'rgba(108,92,231,0.08)' }
        }
      },
      plugins: { legend: { display: false } }
    }
  });
}

async function shareResult() {
  var r = resultData.type;
  var dims = resultData.dimensions;

  var html = '<div class="share-card-header">' +
    '<span class="emoji">' + (r.emoji || '📊') + '</span>' +
    '<div class="name">' + r.name + '</div>' +
    '<div class="desc">' + (r.shortDesc || '') + '</div>' +
  '</div>' +
  '<div class="share-card-body">' +
    '<h4>四维能量得分</h4>' +
    '<div class="share-scores">';

  for (var i = 0; i < config.dimensions.length; i++) {
    var d = config.dimensions[i];
    var val = (dims[d.id] && dims[d.id].percentage) || 0;
    html += '<div class="share-score-item">' +
      '<div class="label">' + d.name + '</div>' +
      '<div class="val" style="color:' + d.color + '">' + val + '%</div>' +
    '</div>';
  }

  html += '</div>' +
    '<p style="font-size:13px;color:#636E72;line-height:1.6;text-align:center;margin-top:12px;">' +
    (r.coreConclusion || '') + '</p>' +
    '</div>' +
    '<div class="share-card-footer">' + config.meta.title + '</div>';

  var shareCard = document.getElementById('shareCard');
  shareCard.innerHTML = html;
  shareCard.style.left = '0';
  shareCard.style.top = '0';
  shareCard.style.zIndex = '-1';

  await new Promise(function(resolve) { setTimeout(resolve, 300); });

  try {
    var canvas = await html2canvas(shareCard, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#FFFFFF'
    });

    shareCard.style.left = '-9999px';
    shareCard.style.zIndex = '';

    var link = document.createElement('a');
    link.download = config.meta.title + '-' + r.name + '.png';
    link.href = canvas.toDataURL('image/png');
    link.click();

    showToast('✅ 图片已保存，可分享到评论区');
  } catch(e) {
    shareCard.style.left = '-9999px';
    shareCard.style.zIndex = '';
    showToast('请截图此页面分享到评论区');
  }
}

function restartTest() {
  currentQuestion = 0;
  answers = {};
  resultData = null;
  renderCover();
  showPage('coverPage');
}

function showToast(msg) {
  var toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(function() { toast.classList.remove('show'); }, 2500);
}

init();
