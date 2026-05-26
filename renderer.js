// ══════════════════════════════════════════════════════════════════
// 番茄钟配置常量
// ══════════════════════════════════════════════════════════════════

// 三种模式的配置：名称 + 时长（分钟）
const MODES = {
  work:  { label: '专注',   minutes: 25 },  // 工作专注阶段
  short: { label: '短休息', minutes: 5  },  // 完成一个番茄后的短暂休息
  long:  { label: '长休息', minutes: 15 },  // 完成四个番茄后的长休息
}

// 每个周期包含的番茄数，满 4 个触发长休息
const POMODOROS_PER_CYCLE = 4

// SVG 环形进度条的周长（圆心 96px → 2π×96 ≈ 603px）
// 用于计算 stroke-dashoffset 来控制进度弧线的长度
const CIRCUMFERENCE = 2 * Math.PI * 96

// ══════════════════════════════════════════════════════════════════
// 获取页面中所有需要操作的 DOM 元素
// ══════════════════════════════════════════════════════════════════

const timeDisplay   = document.getElementById('timeDisplay')   // 中央时间文字（如 25:00）
const sessionLabel  = document.getElementById('sessionLabel')  // 时间下方的小标签（如"第 1 个番茄"）
const ringFg        = document.getElementById('ringFg')        // SVG 环形进度条的前景弧线
const btnStart      = document.getElementById('btnStart')      // 开始 / 暂停 / 继续 按钮
const btnReset      = document.getElementById('btnReset')      // 重置按钮
const btnSkip       = document.getElementById('btnSkip')       // 跳过当前阶段按钮
const tomatoRow     = document.getElementById('tomatoRow')     // 底部番茄进度点容器
const statToday     = document.getElementById('statToday')     // 今日完成数显示
const statTotal     = document.getElementById('statTotal')     // 历史总计数显示
const tabs          = document.querySelectorAll('.tab')        // 顶部三个模式切换标签

// ══════════════════════════════════════════════════════════════════
// 运行时状态变量
// ══════════════════════════════════════════════════════════════════

let mode          = 'work'                      // 当前模式（work / short / long）
let totalSeconds  = MODES.work.minutes * 60     // 当前模式的总秒数（初始 1500s）
let remaining     = totalSeconds                // 当前剩余秒数，每秒递减
let running       = false                       // 计时器是否正在运行
let intervalId    = null                        // setInterval 的返回 ID，用于清除定时器
let pomodorosDone = 0                           // 当前周期内已完成的番茄数（0~3，满 4 触发长休息）
let todayCount    = 0                           // 今日完成的番茄总数
let totalCount    = loadStat('totalCount') || 0 // 历史累计完成数，从 localStorage 读取
let lastDate      = loadStat('lastDate')   || ''// 上次记录的日期，用于判断是否跨天

// ──────────────────────────────────────────────────────────────────
// 跨天检测：如果今天与上次记录的日期不同，则重置今日计数
// ──────────────────────────────────────────────────────────────────
const today = new Date().toLocaleDateString()
if (lastDate !== today) {
  // 新的一天，今日计数清零并更新存储中的日期
  todayCount = 0
  saveStat('todayCount', 0)
  saveStat('lastDate', today)
} else {
  // 同一天，从 localStorage 恢复今日计数
  todayCount = loadStat('todayCount') || 0
}

// 页面加载完成后立即渲染一次初始状态
render()

// ══════════════════════════════════════════════════════════════════
// 事件监听绑定
// ══════════════════════════════════════════════════════════════════

// 顶部三个模式 tab 点击时切换模式，并重置当前周期计数
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    switchMode(tab.dataset.mode, true)  // fix: 手动切换 tab 时确实需要重置周期
  })
})

btnStart.addEventListener('click', toggleTimer)  // 开始 / 暂停 切换
btnReset.addEventListener('click', resetTimer)   // 重置当前阶段
btnSkip.addEventListener('click', skipSession)   // 跳过，直接进入下一阶段

// ══════════════════════════════════════════════════════════════════
// 核心计时逻辑
// ══════════════════════════════════════════════════════════════════

// 切换计时器的运行/暂停状态
function toggleTimer() {
  if (running) {
    pause()
  } else {
    start()
  }
}

// 开始计时：标记运行状态，启动 1 秒定时器，按钮文字改为"暂停"
function start() {
  running = true
  btnStart.textContent = '暂停'
  timeDisplay.classList.add('ticking')         // 加上 CSS 脉冲动画
  intervalId = setInterval(tick, 1000)         // 每秒调用 tick()
}

// 暂停计时：清除定时器，取消动画，按钮文字改为"继续"
function pause() {
  running = false
  btnStart.textContent = '继续'
  timeDisplay.classList.remove('ticking')
  clearInterval(intervalId)
}

// 重置：暂停并将剩余时间恢复为当前模式的总时长
function resetTimer() {
  pause()
  btnStart.textContent = '开始'
  remaining = totalSeconds
  render()
}

// 每秒执行一次的核心 tick：剩余时间减 1，到 0 时触发阶段完成逻辑
function tick() {
  if (!running) return  // fix: 防止后台限流时排队的回调在 pause() 后再次触发
  remaining--
  if (remaining <= 0) {
    remaining = 0
    render()
    onSessionComplete()  // 时间到，处理阶段结束
    return
  }
  render()
}

// 阶段完成后的处理逻辑
function onSessionComplete() {
  pause()
  btnStart.textContent = '开始'

  // fix: 使用当前真实日期，防止跨午夜时 today 变量过期；同时处理运行中跨天的计数重置
  const currentDate = new Date().toLocaleDateString()
  if (currentDate !== today) {
    todayCount = 0
  }

  if (mode === 'work') {
    // 完成一个专注番茄：更新所有计数并持久化
    pomodorosDone++
    todayCount++
    totalCount++
    saveStat('todayCount', todayCount)
    saveStat('totalCount', totalCount)
    saveStat('lastDate', currentDate)  // fix: 保存真实日期而非模块加载时的快照

    notify('番茄完成！', '休息一下吧 🍅')

    // 每完成 4 个番茄（一个完整周期）进入长休息，否则短休息
    if (pomodorosDone % POMODOROS_PER_CYCLE === 0) {
      switchMode('long', false)
    } else {
      switchMode('short', false)
    }
  } else {
    // 休息结束：切回专注模式
    notify('休息结束', '准备好继续专注了吗？')
    switchMode('work', false)
  }

  renderStats()
}

// 跳过当前阶段，手动提前进入下一阶段（不计入完成数，但推进周期计数）
function skipSession() {
  pause()
  btnStart.textContent = '开始'
  if (mode === 'work') {
    // fix: 跳过也要推进 pomodorosDone，与 onSessionComplete 使用相同的边界判断（% === 0）
    // 原来不递增导致下一次真实完成仍触发长休息，产生两次连续长休息
    pomodorosDone++
    if (pomodorosDone % POMODOROS_PER_CYCLE === 0) {
      switchMode('long', false)
    } else {
      switchMode('short', false)
    }
  } else {
    // 跳过休息：直接回到专注模式
    switchMode('work', false)
  }
}

// 切换模式：更新 tab 高亮、body 颜色主题类名、重置计时
function switchMode(newMode, resetPomodoros = false) {
  mode = newMode
  totalSeconds = MODES[newMode].minutes * 60  // 更新总秒数
  remaining = totalSeconds                    // 剩余时间重置为新模式时长

  if (resetPomodoros) pomodorosDone = 0       // 仅在手动点击 tab 时重置周期计数

  // 更新顶部 tab 的 active 样式
  tabs.forEach(t => t.classList.toggle('active', t.dataset.mode === newMode))

  // 更新 body 的 class，CSS 变量 --accent 会随之切换配色
  document.body.className = `mode-${newMode}`

  render()
}

// ══════════════════════════════════════════════════════════════════
// 渲染函数：将状态同步到 DOM
// ══════════════════════════════════════════════════════════════════

// 主渲染函数，每次状态变化后调用
function render() {
  // 格式化剩余时间为 MM:SS
  const mins = String(Math.floor(remaining / 60)).padStart(2, '0')
  const secs = String(remaining % 60).padStart(2, '0')
  timeDisplay.textContent = `${mins}:${secs}`

  // 计算环形进度条的偏移量：
  // progress=1 时 offset=0（完整圆），progress=0 时 offset=CIRCUMFERENCE（空圆）
  const progress = remaining / totalSeconds
  const offset = CIRCUMFERENCE * (1 - progress)
  ringFg.style.strokeDashoffset = offset

  // 更新阶段标签文字
  if (mode === 'work') {
    const num = (pomodorosDone % POMODOROS_PER_CYCLE) + 1  // 显示第几个番茄（1-4）
    sessionLabel.textContent = `第 ${num} 个番茄`
  } else {
    sessionLabel.textContent = mode === 'short' ? '短休息中' : '长休息中'
  }

  renderTomatoes()
  renderStats()
}

// 渲染底部番茄进度点：当前周期已完成的点高亮显示
function renderTomatoes() {
  tomatoRow.innerHTML = ''
  const cyclePos = pomodorosDone % POMODOROS_PER_CYCLE
  // fix: 长休息阶段 cyclePos 恰好为 0（刚完成整轮），应显示全部 4 个已完成
  // 否则 i < 0 永远 false，导致全部点在恰好完成一轮时错误地显示为未完成
  const doneCount = (mode === 'long' && cyclePos === 0 && pomodorosDone > 0)
    ? POMODOROS_PER_CYCLE
    : cyclePos
  for (let i = 0; i < POMODOROS_PER_CYCLE; i++) {
    const dot = document.createElement('div')
    dot.className = 'tomato' + (i < doneCount ? ' done' : '')
    tomatoRow.appendChild(dot)
  }
}

// 渲染统计数字
function renderStats() {
  statToday.textContent = todayCount
  statTotal.textContent = totalCount
}

// ══════════════════════════════════════════════════════════════════
// 系统通知
// ══════════════════════════════════════════════════════════════════

// 通过 preload.js 暴露的 electronAPI 发送原生桌面通知
function notify(title, body) {
  if (window.electronAPI) {
    window.electronAPI.notify(title, body)
  }
}

// ══════════════════════════════════════════════════════════════════
// 数据持久化（localStorage）
// ══════════════════════════════════════════════════════════════════

// 将任意值序列化后存入 localStorage
function saveStat(key, val) {
  localStorage.setItem(key, JSON.stringify(val))
}

// 从 localStorage 读取并反序列化，读取失败返回 null
function loadStat(key) {
  try { return JSON.parse(localStorage.getItem(key)) } catch { return null }
}
