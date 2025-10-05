require('dotenv').config();
const Fastify = require('fastify');
const TelegramBot = require('node-telegram-bot-api');
const token = process.env.BOT_TOKEN;
const admin = Number(process.env.ADMIN_ID);
const webhookUrl = process.env.WEBHOOK_URL;
const PORT = process.env.PORT || 3000;
const bot = new TelegramBot(token, { webHook: true });
const fastify = Fastify({
  logger: false 
});

bot.setWebHook(`${webhookUrl}/bot${token}`);

fastify.post(`/bot${token}`, async (request, reply) => {
  bot.processUpdate(request.body);
  reply.code(200).send({ status: 'ok' });
});

fastify.get('/', async (request, reply) => {
  return { message: '🤖 Bot Fastify bilan ishga tushdi!' };
});

fastify.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`✅ Fastify server ${PORT}-portda ishlayapti`);
});
const db = require('./db/db');
const userStates = new Map();
const products = {
    '50stars': { title: "💝🧸 15 stars", price: 5000 },
    '100stars': { title: "🎁🌹 25 stars", price: 8000 },
    '150stars': { title: "💐🚀 50 stars", price: 13000 },
    '200stars': { title: "💎💍 100 stars", price: 24000 },
    '3premium': { title: "🎁3 oylik premium", price: 193000 },
    '6premium': { title: "🎁6 oylik premium", price: 263000 },
    '12premium': { title: "🎁12 oylik premium", price: 458000 },
    'account': { title: "📱Telegram hisob", price: 18000 }
};
bot.on('message', async (message) => {
    const chatId = message.chat.id;
    const name = message.from.first_name;
    const username = message.from.username || '';

    if (message.text === '/start') {
        try {
            const check = await db.query('SELECT * FROM users WHERE id = $1', [chatId]);
            if (check.rows.length > 0) {
                await bot.sendMessage(chatId, `<b><a href='tg://user?id=${chatId}'>${name}</a> siz asosiy menyudasiz:</b>`, {
                parse_mode: 'HTML',
                    reply_markup: {
                        keyboard: [
                            [{ text: "🛍 Buyurtma berish 🛒" }],
                            [{ text: "👤Hisobim" }, { text: "📒Qo'llanma" }]
                        ],
                        resize_keyboard: true
                    }
                });
            } else {
                await bot.sendMessage(chatId, `<b><a href='tg://user?id=${chatId}'>${name}</a> ro'yxatdan o'tish uchun raqamingizni yuboring⤵️</b>`, {
                    parse_mode: 'HTML',
                    reply_markup: {
                        keyboard: [
                            [{ text: "📞 Raqamingizni yuborish", request_contact: true }]
                        ],
                        resize_keyboard: true,
                        one_time_keyboard: true
                    }
                });
            }
        } catch (err) {
            console.error("❌ Xatolik:", err);
            await bot.sendMessage(chatId, "❌ Serverda xatolik yuz berdi. Keyinroq urinib ko‘ring.");
        }
    }
        if (message.contact) {
        const phone = message.contact.phone_number;

        try {
            const check = await db.query('SELECT * FROM users WHERE id = $1', [chatId]);

            if (check.rows.length === 0) {
                await db.query(`
                    INSERT INTO users (id, name, username, phone, balance)
                    VALUES ($1, $2, $3, $4, $5)
                `, [chatId, name, username, phone, 0]);

                await bot.sendMessage(chatId, `<b>✅ <a href='tg://user?id=${chatId}'>Siz</a> muvaffaqiyatli ro'yxatdan o'tdingiz!</b>`, {
                    parse_mode : 'HTML',
                    reply_markup: {
                        keyboard: [
                            [{ text: "🛍 Buyurtma berish 🛒" }],
                            [{ text: "👤Hisobim" }, { text: "📒Qo'llanma" }]
                        ],
                        resize_keyboard: true
                    }
                });
            } else {
                await bot.sendMessage(chatId, `👤 Siz allaqachon ro'yxatdan o'tgansiz.`);
            }
        } catch (err) {
            console.error("❌ Ro'yxatdan o'tishda xatolik:", err);
            await bot.sendMessage(chatId, "❌ Xatolik yuz berdi. Keyinroq urinib ko‘ring.");
        }
    }
    if (message.text === "🛍 Buyurtma berish 🛒") {
        await bot.sendMessage(chatId, `<b>Kerakli bo'limni tanlang :</b>`, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: "⭐ Gifts", callback_data: "stars" }],
                    [{ text: "💎 Premium", callback_data: "premium" }],
                    [{ text: "📱 Vertual raqam", callback_data: "vertual" }]
                ]
            }
        });
    }
    if (message.text === "👤Hisobim") {
        try {
            const res = await db.query('SELECT * FROM users WHERE id = $1', [chatId]);
            if (res.rows.length === 0) {
                return bot.sendMessage(chatId, "Siz ro'yxatdan o'tmagansiz. Iltimos /start bosing va ro'yxatdan o'ting.");
            }
            const user = res.rows[0];
            await bot.sendMessage(chatId, `<b>👤 Hisobingiz:</b>\n\n🆔ID: <code>${user.id}</code>\n🔹Ism: <b>${user.name}</b>\n🎈Balans: <b>${user.balance} so'm</b>`, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "Hisobimni to'ldirish", callback_data: 'payment' }]
                    ]
                }
            });
        } catch (err) {
            console.error(err);
            bot.sendMessage(chatId, "❌ Xatolik yuz berdi. Keyinroq urinib ko‘ring.");
        }
    }

    if (userStates.get(chatId) === 'awaiting_payment_amount') {
        const amount = parseInt(message.text);
        if (!amount || amount < 1000) {
            return bot.sendMessage(chatId, "❌ Iltimos, minimal 1000 so'mdan boshlab faqat son kiriting. Qaytadan urinib ko'ring.");
        }
        userStates.set(chatId, { stage: 'awaiting_payment_receipt', amount });
        return bot.sendMessage(chatId, `✅ Siz ${amount} so'm to'lashni tanladingiz.\nIltimos, to'lov chekini rasm shaklida yuboring.`);
    }

    if (userStates.has(chatId) && userStates.get(chatId).stage === 'awaiting_payment_receipt') {
        if (message.photo) {
            const photoArray = message.photo;
            const fileId = photoArray[photoArray.length - 1].file_id;
            const paymentData = userStates.get(chatId);
            const forwardMsg = `<b>Yangi to'lov kelib tushdi!</b>\n\nFoydalanuvchi: <a href="tg://user?id=${chatId}">${name}</a>\nID: <code>${chatId}</code>\nSumma: <b>${paymentData.amount} so'm</b>`;
            try {
                await bot.sendMessage(chatId, "✅ Sizning to'lovingiz adminga yuborildi. Iltimos, biroz kuting.");
                await bot.sendPhoto(admin, fileId, {
    caption: forwardMsg,
    parse_mode: 'HTML',
    reply_markup: {
        inline_keyboard: [
            [
                {
                    text: "✅ Tasdiqlash",
                    callback_data: `confirmPayment:${chatId}:${paymentData.amount}`
                },
                {
                    text: "❌ Bekor qilish",
                    callback_data: `rejectPayment:${chatId}`
                }
            ]
        ]
    }
});
                userStates.delete(chatId);
            } catch (err) {
                console.error(err);
                await bot.sendMessage(chatId, "❌ Xatolik yuz berdi. Iltimos, keyinroq urinib ko'ring.");
            }
        } else {
            return bot.sendMessage(chatId, "❌ Iltimos, to'lov chekini rasm shaklida yuboring.");
        }
    }
        if(message.text === "📒Qo'llanma"){
        await bot.sendMessage(chatId,`<blockquote><b>Ushbu bot orqali : gifts, premium, vertual raqam olishingiz mumkin. Barchasi sifatli va tezkor. Botimizning ustunlik tomonlaridan yana biri maxfiylik tizimi kuchli ekanligida. Agar sizda savollar va takliflar bo'lsa adminga yozing spm bo'lsangiz bot orqali yozishingiz mumkin. Undan tashqari xuddi shu botni sizga ham yasab beramiz narxi - 50 ming so'm</b></blockquote>`, {
            parse_mode : 'HTML',
            reply_markup : {inline_keyboard : [
                [{text : "Adminga xabar yuborish", callback_data : 'message_admin'}],
                [{text : "Bot buyurtma berish", url : "https://t.me/inqiIob"}]
            ]}
        })
    }
    if (userStates.has(chatId) && userStates.get(chatId).stage === 'awaiting_admin_message') {
    const text = message.text;
    if (!text || message.photo || message.document || message.contact || message.sticker) {
        return bot.sendMessage(chatId, `<b>❗️Faqat matnli xabar yuboring yoki bekor qiling. </b>`, {
            parse_mode : 'HTML'
        });
    }
    const user = await db.query('SELECT * FROM users WHERE id = $1', [chatId]);
    const name = user.rows[0]?.name || message.from.first_name;
    const adminMsg = `<b>📩 Yangi xabar</b>\n\n👤 <a href="tg://user?id=${chatId}">${name}</a>\n🆔 ID: <code>${chatId}</code>\n\n💬 Xabar:\n${text}`;
    await bot.sendMessage(admin, adminMsg, { parse_mode: 'HTML' });
    await bot.sendMessage(chatId, `<b>✅ Xabaringiz adminga yuborildi.</b>`, {parse_mode:'HTML'});
    userStates.delete(chatId);
}
    if(message.text === "/panel"){
        if (chatId !== admin) return;
        await bot.sendMessage(admin, `Admin panelga xush kelibsiz`, {
            parse_mode : 'HTML',
            reply_markup : { inline_keyboard : [
                [{text : "Foydalanuvchini topish", callback_data : 'search_user'}],
                [{text : "E'lon berish", callback_data : 'elon'}, {text : "Statistika", callback_data : 'stat'}]
            ]}
        })
    }
    if (userStates.has(chatId)) {
    const ustate = userStates.get(chatId);

    // Agar admin foydalanuvchi ID so‘rayapti
    if (ustate.stage === 'awaiting_search_user_id') {
        const userid = parseInt(message.text);
        if (isNaN(userid)) {
            return bot.sendMessage(chatId, "❌ Iltimos, foydalanuvchi ID (raqam) kiriting.");
        }
        // So‘ralgan user ma’lumotlarini bazadan olib kelish
        const res = await db.query('SELECT id, name, username, phone, balance FROM users WHERE id = $1', [userid]);
        if (res.rows.length === 0) {
            userStates.delete(chatId);
            return bot.sendMessage(chatId, `❌ Foydalanuvchi topilmadi (ID: ${userid}).`);
        }
        const user = res.rows[0];
        await bot.sendMessage(chatId,
            `👤 Foydalanuvchi:\n` +
            `ID: <code>${user.id}</code>\n` +
            `Ism: <b>${user.name}</b>\n` +
            `Username: <b>@${user.username}</b>\n` +
            `Telefon: <b>${user.phone}</b>\n` +
            `Balans: <b>${user.balance} so‘m</b>`,
            {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "➕ Pullar qo‘shish", callback_data: `admin_add_${user.id}` },
                            { text: "➖ Pullar ayirish", callback_data: `admin_sub_${user.id}` }
                        ],
                        [
                            { text: "🔙 Orqaga", callback_data: 'admin_back_panel' }
                        ]
                    ]
                }
            }
        );
        userStates.delete(chatId);
        return;
    }

    if (ustate.stage === 'awaiting_admin_add_amount') {
        const amount = parseInt(message.text);
        if (isNaN(amount) || amount <= 0) {
            return bot.sendMessage(chatId, "❌ Iltimos, musbat raqam kiriting.");
        }
        const targetId = ustate.targetId;
        await db.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [amount, targetId]);
        await bot.sendMessage(chatId, `✅ Foydalanuvchining balansiga ${amount} so‘m qo‘shildi.`);
        await bot.sendMessage(targetId, `✅ Sizga admin tomonidan ${amount} so‘m qo‘shildi.`);

        userStates.delete(chatId);
        return;
    }

    if (ustate.stage === 'awaiting_admin_sub_amount') {
        const amount = parseInt(message.text);
        if (isNaN(amount) || amount <= 0) {
            return bot.sendMessage(chatId, "❌ Iltimos, musbat raqam kiriting.");
        }
        const targetId = ustate.targetId;
        const res = await db.query('SELECT balance FROM users WHERE id = $1', [targetId]);
        if (res.rows.length === 0) {
            userStates.delete(chatId);
            return bot.sendMessage(chatId, `❌ Foydalanuvchi topilmadi.`);
        }
        const currentBalance = res.rows[0].balance;
        if (currentBalance < amount) {
            userStates.delete(chatId);
            return bot.sendMessage(chatId, `❌ Foydalanuvchining balansida yetarli mablag‘ yo‘q.`);
        }
        await db.query('UPDATE users SET balance = balance - $1 WHERE id = $2', [amount, targetId]);
        await bot.sendMessage(chatId, `✅ Foydalanuvchining balansidan ${amount} so‘m ayirildi.`);
        await bot.sendMessage(targetId, `❌ Admin tomonidan ${amount} so‘m olib ketildi.`);

        userStates.delete(chatId);
        return;
    }

    if (ustate.stage === 'awaiting_admin_announcement') {
        const text = message.text;
        if (!text) {
            return bot.sendMessage(chatId, "❗️ Iltimos, e'lon matnini yuboring.");
        }
        const res = await db.query('SELECT id FROM users');
        for (const row of res.rows) {
            bot.sendMessage(row.id, `<b>${text}</b>`, {parse_mode : 'HTML'});
        }
        await bot.sendMessage(chatId, "✅ E'lon barcha foydalanuvchilarga yuborildi.");
        userStates.delete(chatId);
        return;
    }}
});

bot.on('callback_query', async (query) => {
    const data = query.data;
    const chatId = query.message.chat.id;

    try {
        if (data === 'stars') {
            await bot.editMessageText(`<b>⭐ Sizga nechta stars kerak tanlang: </b>`, {
                chat_id : query.message.chat.id,
                message_id : query.message.message_id,
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "💝🧸 15 stars", callback_data: '50stars' }],
                        [{ text: "🎁🌹 25 stars", callback_data: '100stars' }],
                        [{ text: "💐🚀 50 stars", callback_data: '150stars' }],
                        [{ text: "💎💍 100 stars", callback_data: '200stars' }],
                        [{text : "🌸 NFT 🌿", url : "tg://user?id=${admin}"}]
                    ]
                }
            });
        }

        else if (data === 'premium') {
            await bot.editMessageText(`<b><blockquote>💎 Sizga nechi oylik premium kerak tanlang: </blockquote></b>\n\n<u><b>Bularning barchasi hisobga kirmasdan olib beriladi!</b></u>`, {
                chat_id : query.message.chat.id,
                message_id : query.message.message_id,
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "✨3 oylik premium", callback_data: '3premium' }],
                        [{ text: "✨6 oylik premium", callback_data: '6premium' }],
                        [{ text: "✨12 oylik premium", callback_data: '12premium' }]
                    ]
                }
            });
        }

        else if (data === 'vertual') {
            await bot.editMessageText(`<b>📱 Vertual raqam tanlang: </b>`, {
                chat_id : query.message.chat.id,
                message_id : query.message.message_id,
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: `Telegram hisob - 18 000 so'm`, callback_data: 'account' }]
                    ]
                }
            });
        }

        else if (data === 'payment') {
            await bot.sendMessage(chatId, `💳 To'lovni amalga oshirish uchun quyidagi karta raqamiga o’tkazma qiling:\n\n<code>9860 0201 4082 4523</code>\n\nMinimal to'lov miqdori: 1000 so'm\n\nIltimos, qancha to'lov qilmoqchi ekanligingizni raqamda kiriting:`, {
                parse_mode: 'HTML'
            });
            userStates.set(chatId, 'awaiting_payment_amount');
        }

        else if (data.startsWith('confirmPayment')) {
            const parts = data.split(':');
            if (parts.length !== 3) {
                return bot.sendMessage(chatId, '❌ Callback formatda xatolik bor.');
            }

            const [, userIdStr, amountStr] = parts;
            const userId = parseInt(userIdStr);
            const amount = parseInt(amountStr);

            if (isNaN(userId) || isNaN(amount)) {
                return bot.sendMessage(chatId, '❌ ID yoki to‘lov summasi noto‘g‘ri formatda.');
            }

            try {
                await db.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [amount, userId]);
                await bot.sendMessage(userId, `<b>✅ Sizning balansingizga ${amount} so'm qo‘shildi. </b>`, {
                    parse_mode : 'HTML'
                });
                await bot.sendMessage(chatId, `✅ Foydalanuvchi balansiga ${amount} so'm qo‘shildi.`);
            } catch (err) {
                console.error("❌ Bazada xatolik:", err);
                await bot.sendMessage(chatId, '❌ Bazada xatolik yuz berdi.');
            }
        }

        else if (data.startsWith('rejectPayment')) {
            const parts = data.split(':');
            if (parts.length !== 2) {
                return bot.sendMessage(chatId, '❌ Callback formatda xatolik bor.');
            }

            const userId = parseInt(parts[1]);

            if (isNaN(userId)) {
                return bot.sendMessage(chatId, '❌ Foydalanuvchi ID noto‘g‘ri.');
            }

            try {
                await bot.sendMessage(userId, `❌ Sizning to‘lovingiz bekor qilindi.`);
                await bot.sendMessage(chatId, `❌ To‘lov bekor qilindi.`);
            } catch (err) {
                console.error("❌ Foydalanuvchiga yuborishda xatolik:", err);
                await bot.sendMessage(chatId, '❌ Xatolik yuz berdi.');
            }
        }
        else if (products[data]) {
    const product = products[data];
    const res = await db.query('SELECT balance, name FROM users WHERE id = $1', [chatId]);
    const user = res.rows[0];

    if (!user) return bot.sendMessage(chatId, "❌ Foydalanuvchi topilmadi.");

    if (user.balance < product.price) {
        return bot.sendMessage(chatId, `❌ Sizning balansingizda yetarli mablag' mavjud emas.\n\n🔐 Mahsulot: <b>${product.title}</b>\n💰 Narxi: <b>${product.price} so'm</b>\n\n🪙 Balansingiz: <b>${user.balance} so'm</b>`, { parse_mode: 'HTML' });
    }

    userStates.set(chatId, { stage: 'awaiting_purchase_confirmation', productKey: data });

    await bot.sendMessage(chatId, `🛍 Siz quyidagi mahsulotni sotib olmoqchisiz:\n\n📦 Mahsulot: <b>${product.title}</b>\n💰 Narxi: <b>${product.price} so'm</b>\n\nTasdiqlaysizmi?`, {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "✅ Tasdiqlash", callback_data: `confirmPurchase:${data}` },
                    { text: "❌ Bekor qilish", callback_data: `cancelPurchase` }
                ]
            ]
        }
    });
}
else if (data.startsWith('confirmPurchase:')) {
    const productKey = data.split(':')[1];
    const product = products[productKey];
    const res = await db.query('SELECT balance, name FROM users WHERE id = $1', [chatId]);
    const user = res.rows[0];

    if (user.balance < product.price) {
        return bot.sendMessage(chatId, `❌ Balansingizda yetarli mablag' yo'q.`, { parse_mode: 'HTML' });
    }

    await db.query('UPDATE users SET balance = balance - $1 WHERE id = $2', [product.price, chatId]);

    await bot.sendMessage(chatId, `✅ Buyurtma qabul qilindi!\n📦 Mahsulot: <b>${product.title}</b>\n💳 Narx: <b>${product.price} so'm</b>\n\n⏳ Tez orada siz bilan bog'lanamiz.`, {
        parse_mode: 'HTML'
    });

    const adminMsg = `<b>🛒 Yangi buyurtma!</b>\n\n👤 Foydalanuvchi: <a href="tg://user?id=${chatId}">${user.name}</a>\n🆔 ID: <code>${chatId}</code>\n📦 Buyurtma: <b>${product.title}</b>\n💰 Narxi: <b>${product.price} so'm</b>`;
    await bot.sendMessage(admin, adminMsg, { parse_mode: 'HTML' });

    userStates.delete(chatId);
}

else if (data === 'cancelPurchase') {
    userStates.delete(chatId);
    await bot.sendMessage(chatId, "❌ Buyurtma bekor qilindi.");
    await bot.sendMessage(chatId, `<b>Kerakli bo'limni tanlang :</b>`, {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [{ text: "⭐ Gifts", callback_data: "stars" }],
                [{ text: "💎 Premium", callback_data: "premium" }],
                [{ text: "📱 Vertual raqam", callback_data: "vertual" }]
            ]
        }
    });
}
else if (data === 'message_admin') {
    userStates.set(chatId, { stage: 'awaiting_admin_message' });

    await bot.sendMessage(chatId, "✉️ Adminga yuboriladigan xabaringizni yozing:", {
        reply_markup: {
            inline_keyboard: [
                [{ text: "❌ Bekor qilish", callback_data: 'cancel_admin_message' }]
            ]
        }
    });
}
else if (data === 'cancel_admin_message') {
    userStates.delete(chatId);

    await bot.sendMessage(chatId, `<b>Bekor qilindi. Asosiy menyuga qaytdingiz:</b>`, {
        parse_mode: 'HTML',
        reply_markup: {
            keyboard: [
                [{ text: "🛍 Buyurtma berish 🛒" }],
                [{ text: "👤Hisobim" }, { text: "📒Qo'llanma" }]
            ],
            resize_keyboard: true
        }
    });
}
        if (data === 'search_user') {
            userStates.set(chatId, { stage: 'awaiting_search_user_id' });
            await bot.sendMessage(chatId, "🔍 Qidiriladigan foydalanuvchining ID raqamini kiriting:");
        }
        else if (data.startsWith('admin_add_')) {
            const parts = data.split('_');
            const targetId = parseInt(parts[2]);
            if (isNaN(targetId)) {
                return bot.sendMessage(chatId, "❌ ID noto‘g‘ri.");
            }
            userStates.set(chatId, { stage: 'awaiting_admin_add_amount', targetId });
            await bot.sendMessage(chatId, `➕ Foydalanuvchi ${targetId} balansiga qo‘shmoqchi bo‘lgan summani kiriting:`);
        }
        else if (data.startsWith('admin_sub_')) {
            const parts = data.split('_');
            const targetId = parseInt(parts[2]);
            if (isNaN(targetId)) {
                return bot.sendMessage(chatId, "❌ ID noto‘g‘ri.");
            }
            userStates.set(chatId, { stage: 'awaiting_admin_sub_amount', targetId });
            await bot.sendMessage(chatId, `➖ Foydalanuvchi ${targetId} balansidan ayirmoqchi bo‘lgan summani kiriting:`);
        }
        else if (data === 'elon') {
            userStates.set(chatId, { stage: 'awaiting_admin_announcement' });
            await bot.sendMessage(chatId, "📣 E'lon matnini kiriting:");
        }
        else if (data === 'stat') {
            const res1 = await db.query('SELECT COUNT(*) AS cnt FROM users');
            const totalUsers = res1.rows[0].cnt;
            const res2 = await db.query('SELECT SUM(balance) AS total_balance FROM users');
            const totalBal = res2.rows[0].total_balance || 0;
            await bot.sendMessage(chatId,
                `📊 Statistika:\n\n` +
                `👥 Foydalanuvchilar soni: <b>${totalUsers}</b>\n` +
                `💰 Jamlanma balans: <b>${totalBal}</b> so‘m`,
                { parse_mode: 'HTML' }
            );
        }
        else if (data === 'admin_back_panel') {
            await bot.sendMessage(chatId, `Admin panelga xush kelibsiz`, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "Foydalanuvchini topish", callback_data: 'search_user' }],
                        [
                            { text: "E'lon berish", callback_data: 'elon' },
                            { text: "Statistika", callback_data: 'stat' }
                        ]
                    ]
                }
            });
        }
    } catch (err) {
        console.error("❌ Callback queryda xatolik:", err);
        await bot.sendMessage(chatId, "❌ Xatolik yuz berdi.");
    }
    bot.answerCallbackQuery(query.id);
});
