
require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { Pool } = require('pg');
const path = require('path');

// Конфигурация бота
const TOKEN = process.env.TELEGRAM_BOT_TOKEN; // Добавьте ваш токен в .env
const bot = new TelegramBot(TOKEN, { polling: true });

// Конфигурация PostgreSQL
const pool = new Pool({
    connectionString: 'postgresql://postgres:BshHiioPGHcsoklnBwRKnDlBHQYaqCpS@autorack.proxy.rlwy.net:31315/railway',
});

// Создание таблицы пользователей при запуске
const createTable = async () => {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                telegram_id BIGINT UNIQUE,
                balance NUMERIC DEFAULT 0,
                profit_per_hour NUMERIC DEFAULT 20,
                farming BOOLEAN DEFAULT FALSE,
                farming_start_time TIMESTAMP,
                accumulated NUMERIC DEFAULT 0
            )
        `);
    } catch (err) {
        console.error('Ошибка при создании таблицы:', err);
    } finally {
        client.release();
    }
};
createTable();

// Обработчик приветствия
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const firstName = msg.from.first_name || 'Пользователь';
    const text = `Привет, ${firstName}! Добро пожаловать в наш фарминг-бот. Выберите действие ниже:`;

    // Добавляем или обновляем пользователя в БД
    const client = await pool.connect();
    try {
        await client.query(
            `INSERT INTO users (telegram_id) VALUES ($1)
             ON CONFLICT (telegram_id) DO NOTHING`,
            [chatId]
        );
    } catch (err) {
        console.error('Ошибка при добавлении пользователя:', err);
    } finally {
        client.release();
    }

    // Кнопки
    const opts = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: 'Открыть Мини-App', web_app: { url: 'https://nz-farm-production.up.railway.app' } }, // Замените URL на ваш
                ],
                [
                    { text: 'Перейти в Канал', url: 'https://t.me/neztrix' }, // Замените URL на ваш канал
                ],
            ],
        },
    };

    bot.sendMessage(chatId, text, opts);
});

// Express сервер для API и фронтенда
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Маршруты API

// Получение состояния пользователя
app.post('/api/user-state', async (req, res) => {
    const { telegramId } = req.body;
    if (!telegramId) {
        return res.status(400).json({ success: false, message: 'Отсутствует telegramId' });
    }

    const client = await pool.connect();
    try {
        const result = await client.query(`SELECT * FROM users WHERE telegram_id = $1`, [telegramId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Пользователь не найден' });
        }
        res.json({ success: true, user: result.rows[0] });
    } catch (err) {
        console.error('Ошибка при получении состояния пользователя:', err);
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    } finally {
        client.release();
    }
});

// Запуск фарминга
app.post('/api/start-farming', async (req, res) => {
    const { telegramId, farmingStartTime } = req.body;
    if (!telegramId || !farmingStartTime) {
        return res.status(400).json({ success: false, message: 'Недостаточно данных' });
    }

    const client = await pool.connect();
    try {
        await client.query(
            `UPDATE users SET farming = TRUE, farming_start_time = $1 WHERE telegram_id = $2`,
            [farmingStartTime, telegramId]
        );
        res.json({ success: true, message: 'Фарминг запущен' });
    } catch (err) {
        console.error('Ошибка при запуске фарминга:', err);
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    } finally {
        client.release();
    }
});

// Остановка фарминга
app.post('/api/stop-farming', async (req, res) => {
    const { telegramId, accumulated } = req.body;
    if (!telegramId || accumulated === undefined) {
        return res.status(400).json({ success: false, message: 'Недостаточно данных' });
    }

    const client = await pool.connect();
    try {
        await client.query(
            `UPDATE users SET farming = FALSE, accumulated = accumulated + $1 WHERE telegram_id = $2`,
            [accumulated, telegramId]
        );
        res.json({ success: true, message: 'Фарминг завершен' });
    } catch (err) {
        console.error('Ошибка при остановке фарминга:', err);
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    } finally {
        client.release();
    }
});

// Вывод награды
app.post('/api/claim', async (req, res) => {
    const { telegramId, claim } = req.body;
    if (!telegramId || claim === undefined) {
        return res.status(400).json({ success: false, message: 'Недостаточно данных' });
    }

    const client = await pool.connect();
    try {
        const result = await client.query(`SELECT balance, accumulated FROM users WHERE telegram_id = $1`, [telegramId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Пользователь не найден' });
        }

        let user = result.rows[0];
        const accumulatedAmount = parseFloat(user.accumulated) || 0;

        if (accumulatedAmount < claim) {
            return res.status(400).json({ success: false, message: 'Накопленная сумма меньше запрашиваемой' });
        }

        // Обновляем баланс и сбрасываем накопленную сумму
        await client.query(
            `UPDATE users SET balance = balance + $1, accumulated = accumulated - $1 WHERE telegram_id = $2`,
            [claim, telegramId]
        );

        res.json({ success: true, message: `Награда ${claim.toFixed(3)} $NZ успешно забрана!` });
    } catch (err) {
        console.error('Ошибка при выводе награды:', err);
        res.status(500).json({ success: false, message: 'Ошибка сервера' });
    } finally {
        client.release();
    }
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
