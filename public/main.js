
// Получение элементов
const farmButton = document.getElementById('farmButton');
const buttonText = document.getElementById('buttonText');
const balanceAmount = document.getElementById('balanceAmount');
const toast = document.getElementById('toast');
const navItems = document.querySelectorAll('.nav-item');

// Флаги состояния
let farming = false;
let claimMode = false;
let balance = 0;
let accumulated = 0;
let farmingInterval;
let farmingTimeout;

// Telegram WebApp объект
const telegram = window.Telegram.WebApp;

// Функция для отображения уведомлений
function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 4000);
}

// Функция для обновления интерфейса на основе состояния
function updateInterface(data) {
    balance = parseFloat(data.balance) || 0;
    balanceAmount.textContent = balance.toFixed(3);

    if (data.farming) {
        farming = true;
        claimMode = false;
        farmButton.classList.add('active');
        farmButton.classList.remove('claim-mode');
        buttonText.style.opacity = 0;
        startFarmingInterval();

        // Рассчитать оставшееся время
        const farmingStartTime = new Date(data.farming_start_time).getTime();
        const farmingDuration = 3 * 60 * 60 * 1000; // 3 часа
        const elapsed = Date.now() - farmingStartTime;
        const remaining = farmingDuration - elapsed;

        if (remaining > 0) {
            farmingTimeout = setTimeout(stopFarming, remaining);
        } else {
            stopFarming();
        }
    } else if (data.accumulated > 0) {
        farming = false;
        claimMode = true;
        farmButton.classList.add('claim-mode');
        farmButton.classList.remove('active');
        buttonText.textContent = '';
        document.querySelector('.claim-number').textContent = parseFloat(data.accumulated).toFixed(3);
    } else {
        farming = false;
        claimMode = false;
        farmButton.classList.remove('active');
        farmButton.classList.remove('claim-mode');
        buttonText.textContent = 'НАЧАТЬ ФАРМИНГ';
    }
}

// Инициализация приложения
async function initApp() {
    try {
        const response = await fetch('/api/user-state', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                telegramId: telegram.initDataUnsafe.user.id,
            }),
        });
        const data = await response.json();
        if (data.success) {
            updateInterface(data.user);
            if (data.user.farming) {
                // Добавлено выше, обработка фарминга
            }
        } else {
            showToast('Ошибка при инициализации данных.');
        }
    } catch (error) {
        console.error('Ошибка:', error);
        showToast('Произошла ошибка при инициализации приложения.');
    }
}

// Запуск фарминга
farmButton.addEventListener('click', async () => {
    if (!farming && !claimMode) {
        startFarming();
    } else if (claimMode) {
        await claimRewards();
    }
});

function startFarming() {
    farming = true;
    const farmingStartTime = new Date().toISOString();
    farmButton.classList.add('active');
    farmButton.classList.remove('claim-mode');
    buttonText.style.opacity = 0;
    accumulated = 0;
    startFarmingInterval();

    // Отправить запрос на сервер о запуске фарминга
    fetch('/api/start-farming', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            telegramId: telegram.initDataUnsafe.user.id,
            farmingStartTime: farmingStartTime,
        }),
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showToast('Фарминг начат!');
            // Установить таймаут на 3 часа
            farmingTimeout = setTimeout(stopFarming, 3 * 60 * 60 * 1000);
        } else {
            showToast('Не удалось начать фарминг.');
        }
    })
    .catch(error => {
        console.error('Ошибка:', error);
        showToast('Произошла ошибка при запуске фарминга.');
    });
}

function startFarmingInterval() {
    farmingInterval = setInterval(() => {
        balance += 0.005;
        accumulated += 0.005;
        balanceAmount.textContent = balance.toFixed(3);
    }, 1000);
}

function stopFarming() {
    farming = false;
    clearInterval(farmingInterval);
    farmButton.classList.remove('active');
    farmButton.classList.add('claim-mode');
    buttonText.textContent = '';
    document.querySelector('.claim-number').textContent = accumulated.toFixed(3);

    // Отправить запрос на сервер о завершении фарминга
    fetch('/api/stop-farming', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            telegramId: telegram.initDataUnsafe.user.id,
            accumulated: accumulated,
        }),
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showToast('Фарминг закончен! Можете забрать награду.');
        } else {
            showToast('Не удалось завершить фарминг.');
        }
    })
    .catch(error => {
        console.error('Ошибка:', error);
        showToast('Произошла ошибка при завершении фарминга.');
    });
}

async function claimRewards() {
    // Отправить запрос на сервер о выводе средств
    try {
        const response = await fetch('/api/claim', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                telegramId: telegram.initDataUnsafe.user.id,
                claim: accumulated,
            }),
        });
        const data = await response.json();
        if (data.success) {
            showToast(`Вы забрали ${accumulated.toFixed(3)} $NZ!`);
            balance += accumulated;
            balanceAmount.textContent = balance.toFixed(3);
            accumulated = 0;
            farmButton.classList.remove('claim-mode');
            buttonText.textContent = 'НАЧАТЬ ФАРМИНГ';
        } else {
            showToast(data.message || 'Не удалось забрать награду.');
        }
    } catch (error) {
        console.error('Ошибка:', error);
        showToast('Произошла ошибка при выводе награды.');
    }
}

// Панель навигации
navItems.forEach(item => {
    item.addEventListener('click', () => {
        navItems.forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');
        const section = item.getAttribute('data-section');
        showSection(section);
    });
});

function showSection(section) {
    // Реализуйте логику переключения между разделами
    showToast(`Перешли в раздел: ${section}`);
}

// Полноэкранный режим
function enterFullscreen() {
    telegram.requestFullscreen();
}

// Включить полноэкранный режим при загрузке
window.addEventListener('load', () => {
    initApp();
    enterFullscreen();
});

// Выход из полноэкранного режима при сворачивании приложения
telegram.onEvent('visibilityChanged', () => {
    if (!telegram.isVisible) {
        telegram.exitFullscreen();
    }
});
