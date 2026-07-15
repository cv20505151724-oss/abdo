// ==================== الثوابت والمتغيرات العامة ====================
const BIN_ID = '6a56c577f5f4af5e298fe334';
const MASTER_KEY = '$2a$10$2gnQoLStFhl.haEy7SLT7..mfay15HKo/Y5JE.mKecCrrdVr0MPa2';

const defaultAvatar = 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
const adminAvatarUrl = 'https://i.ibb.co/tTHSpcbx/FB-IMG-1781216316215.jpg';

let selectedImageBase64 = "";
let currentChatTargetId = null;
let activeCustomizerType = "";

let mediaRecorder = null;
let voiceChunks = [];
let isRecording = false;

let cloudData = {
    users: [],
    chats: {},
    system: { bannedUsers: [], pendingAlerts: {} },
    statuses: []
};

let localState = {
    accounts: [],
    activeIndex: 0
};

// ==================== [1] إدارة الاتصال بقاعدة بيانات JSONBin ====================
async function fetchCloudData() {
    try {
        const response = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}/latest`, {
            method: 'GET',
            headers: { 'X-Master-Key': MASTER_KEY }
        });
        const resJson = await response.json();
        cloudData = resJson.record;
        if (!cloudData.users) cloudData.users = [];
        if (!cloudData.chats) cloudData.chats = {};
        if (!cloudData.system) cloudData.system = { bannedUsers: [], pendingAlerts: {} };
        if (!cloudData.statuses) cloudData.statuses = [];
        cleanExpiredStatuses();
        return cloudData;
    } catch (error) {
        console.error("خطأ أثناء جلب البيانات السحابية:", error);
    }
}

async function updateCloudData() {
    try {
        await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Master-Key': MASTER_KEY
            },
            body: JSON.stringify(cloudData)
        });
    } catch (error) {
        console.error("خطأ أثناء تحديث البيانات على السحاب:", error);
    }
}

// ==================== [2] تهيئة التطبيق ====================
async function initApp() {
    const savedLocal = localStorage.getItem("WhatsAppLocalState");
    if (savedLocal) {
        localState = JSON.parse(savedLocal);
    }
    await fetchCloudData();

    if (localState.accounts && localState.accounts.length > 0) {
        localState.accounts = localState.accounts.filter(localAcc => {
            const cloudUser = cloudData.users.find(cloudAcc => cloudAcc.id === localAcc.id);
            if (cloudUser) {
                Object.assign(localAcc, cloudUser);
                return true;
            }
            return false;
        });
        if (localState.accounts.length === 0) {
            localStorage.removeItem("WhatsAppLocalState");
            showRegisterPage();
        } else {
            if (localState.activeIndex >= localState.accounts.length) localState.activeIndex = 0;
            saveLocalState();
            applyActiveAccountUI();
            document.getElementById('page1').style.display = 'none';
            document.getElementById('page2').style.display = 'flex';
            checkForIncomingAlerts();
        }
    } else {
        showRegisterPage();
    }

    setInterval(realtimeSync, 3000);
}

function showRegisterPage() {
    document.getElementById('page1').style.display = 'flex';
    document.getElementById('page2').style.display = 'none';
}

function saveLocalState() {
    localStorage.setItem("WhatsAppLocalState", JSON.stringify(localState));
}

function getActiveAccount() {
    return localState.accounts[localState.activeIndex] || null;
}

// ==================== [3] التسجيل ====================
function previewImage(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            selectedImageBase64 = e.target.result;
            document.getElementById('imagePreview').style.backgroundImage = `url(${selectedImageBase64})`;
        };
        reader.readAsDataURL(file);
    }
}

async function saveAndContinue() {
    const name = document.getElementById('username').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const password = document.getElementById('password').value.trim();

    if (!name || !phone || !password) {
        alert("يرجى ملء جميع الحقول!");
        return;
    }

    const existing = cloudData.users.find(u => u.phone === phone);
    if (existing) {
        alert("رقم الهاتف مسجل مسبقاً! يرجى تسجيل الدخول.");
        return;
    }

    const newUser = {
        id: '#' + Math.floor(Math.random() * 9000 + 1000),
        name: name,
        phone: phone,
        password: password,
        avatar: selectedImageBase64 || defaultAvatar,
        verified: false,
        isAdmin: false,
        status: "متوفر حالياً",
        banned: false
    };

    if (cloudData.users.length === 0) {
        newUser.isAdmin = true;
        newUser.verified = true;
    }

    cloudData.users.push(newUser);
    await updateCloudData();

    localState.accounts.push({ ...newUser });
    localState.activeIndex = localState.accounts.length - 1;
    saveLocalState();

    document.getElementById('page1').style.display = 'none';
    document.getElementById('page2').style.display = 'flex';
    applyActiveAccountUI();

    if (newUser.isAdmin) {
        document.getElementById('adminPanelIcon').style.display = 'inline';
        document.getElementById('adminDropdownItem').style.display = 'block';
    }
    updateSwitchButtonVisibility();
}

// ==================== [4] تطبيق واجهة المستخدم النشط ====================
function applyActiveAccountUI() {
    const user = getActiveAccount();
    if (!user) return;

    document.getElementById('userHeaderName').textContent = user.name;
    document.getElementById('userHeaderAvatar').style.backgroundImage = `url(${user.avatar})`;
    document.getElementById('modalAvatar').style.backgroundImage = `url(${user.avatar})`;
    document.getElementById('modalName').textContent = user.name;
    document.getElementById('modalPhone').textContent = user.phone;
    document.getElementById('modalId').textContent = 'ID: ' + user.id;
    document.getElementById('editNameInput').value = user.name;
    document.getElementById('statusInput').value = user.status || 'متوفر حالياً';

    const badge = document.getElementById('profileVerifiedBadge');
    if (user.verified) {
        badge.innerHTML = '<span class="verified-badge"><i class="fa-solid fa-circle-check"></i></span>';
    } else {
        badge.innerHTML = '';
    }

    if (user.isAdmin) {
        document.getElementById('adminPanelIcon').style.display = 'inline';
        document.getElementById('adminDropdownItem').style.display = 'block';
    } else {
        document.getElementById('adminPanelIcon').style.display = 'none';
        document.getElementById('adminDropdownItem').style.display = 'none';
    }

    if (user.banned) {
        document.getElementById('banScreenOverlay').style.display = 'flex';
        document.getElementById('banLoopPlayer').play();
    } else {
        document.getElementById('banScreenOverlay').style.display = 'none';
        document.getElementById('banLoopPlayer').pause();
    }

    renderChats();
    renderStatuses();
    updateSwitchButtonVisibility();
}

function updateSwitchButtonVisibility() {
    const btn = document.getElementById('switchAccBtn');
    if (localState.accounts.length > 1) {
        btn.style.display = 'inline';
    } else {
        btn.style.display = 'none';
    }
}

// ==================== [5] تبديل الحساب وتسجيل الخروج ====================
function switchAccount() {
    if (localState.accounts.length < 2) return;
    localState.activeIndex = (localState.activeIndex + 1) % localState.accounts.length;
    saveLocalState();
    applyActiveAccountUI();
    closeChat();
    location.reload();
}

function logoutCurrentAccount() {
    if (confirm("هل أنت متأكد من تسجيل الخروج؟")) {
        const user = getActiveAccount();
        if (user) {
            localState.accounts = localState.accounts.filter(acc => acc.id !== user.id);
            if (localState.accounts.length === 0) {
                localStorage.removeItem("WhatsAppLocalState");
                showRegisterPage();
            } else {
                localState.activeIndex = 0;
                saveLocalState();
                applyActiveAccountUI();
                location.reload();
            }
        }
    }
}

// ==================== [6] الدردشة ====================
function renderChats() {
    const list = document.getElementById('chatsList');
    const user = getActiveAccount();
    if (!user) return;

    const chatKeys = Object.keys(cloudData.chats).filter(key => key.includes(user.id));
    let chatUsers = chatKeys.map(key => {
        const ids = key.split('_');
        const otherId = ids[0] === user.id ? ids[1] : ids[0];
        const otherUser = cloudData.users.find(u => u.id === otherId);
        return { id: otherId, user: otherUser, chatKey: key };
    }).filter(item => item.user && !item.user.banned);

    const adminUser = cloudData.users.find(u => u.isAdmin);
    if (adminUser && adminUser.id !== user.id) {
        const key = [user.id, adminUser.id].sort().join('_');
        if (!cloudData.chats[key]) {
            cloudData.chats[key] = [];
        }
        if (!chatUsers.find(c => c.id === adminUser.id)) {
            chatUsers.push({ id: adminUser.id, user: adminUser, chatKey: key });
        }
    }

    if (chatUsers.length === 0) {
        list.innerHTML = `<div class="empty-chats">لا توجد محادثات بعد، ابدأ بالتواصل مع المطور أو أضف جهة اتصال.</div>`;
        return;
    }

    list.innerHTML = '';
    chatUsers.forEach(({ id, user: otherUser, chatKey }) => {
        const msgs = cloudData.chats[chatKey] || [];
        const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;
        const subtext = lastMsg ? (lastMsg.sender === user.id ? 'أنت: ' : '') + lastMsg.text : 'ابدأ المحادثة';

        const card = document.createElement('div');
        card.className = 'chat-card';
        card.setAttribute('data-id', id);
        card.innerHTML = `
            <div class="chat-card-avatar" style="background-image: url(${otherUser.avatar || defaultAvatar});"></div>
            <div class="chat-card-info">
                <div class="chat-card-name-row">
                    <div class="chat-card-name">${otherUser.name} ${otherUser.verified ? '<span class="verified-badge"><i class="fa-solid fa-circle-check"></i></span>' : ''}</div>
                    <span class="chat-card-badge">${id}</span>
                </div>
                <div class="chat-card-subtext">${subtext}</div>
            </div>
        `;
        card.addEventListener('click', () => openChat(id));
        list.appendChild(card);
    });
}

function filterChats() {
    const query = document.getElementById('searchBarInput').value.trim().toLowerCase();
    const cards = document.querySelectorAll('.chat-card');
    cards.forEach(card => {
        const name = card.querySelector('.chat-card-name')?.textContent?.toLowerCase() || '';
        const id = card.getAttribute('data-id')?.toLowerCase() || '';
        if (name.includes(query) || id.includes(query)) {
            card.style.display = 'flex';
        } else {
            card.style.display = 'none';
        }
    });
}

function openChat(targetId) {
    currentChatTargetId = targetId;
    const user = getActiveAccount();
    if (!user) return;
    const targetUser = cloudData.users.find(u => u.id === targetId);
    if (!targetUser) {
        alert("المستخدم غير موجود!");
        return;
    }

    document.getElementById('targetChatHeaderAvatar').style.backgroundImage = `url(${targetUser.avatar || defaultAvatar})`;
    document.getElementById('targetChatHeaderName').textContent = targetUser.name + (targetUser.verified ? ' ✅' : '');

    document.getElementById('chatScreen').style.display = 'flex';
    renderMessages(targetId);
}

function renderMessages(targetId) {
    const user = getActiveAccount();
    if (!user) return;
    const key = [user.id, targetId].sort().join('_');
    if (!cloudData.chats[key]) cloudData.chats[key] = [];

    const container = document.getElementById('chatMessages');
    container.innerHTML = '';
    cloudData.chats[key].forEach(msg => {
        const div = document.createElement('div');
        div.className = `msg ${msg.sender === user.id ? 'sent' : 'received'}`;
        if (msg.type === 'audio') {
            div.innerHTML = `
                <div class="audio-message-player">
                    <button class="audio-control-btn" onclick="playAudio(this, '${msg.audioData}')"><i class="fa-solid fa-play"></i></button>
                    <span>رسالة صوتية</span>
                </div>
            `;
        } else {
            div.textContent = msg.text;
        }
        container.appendChild(div);
    });
    container.scrollTop = container.scrollHeight;
}

function sendMessage() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text || !currentChatTargetId) return;

    const user = getActiveAccount();
    if (!user) return;
    const key = [user.id, currentChatTargetId].sort().join('_');
    if (!cloudData.chats[key]) cloudData.chats[key] = [];

    cloudData.chats[key].push({
        sender: user.id,
        text: text,
        timestamp: Date.now(),
        type: 'text'
    });

    input.value = '';
    updateCloudData();
    renderMessages(currentChatTargetId);
    renderChats();
}

function handleChatKeyPress(e) {
    if (e.key === 'Enter') sendMessage();
}

function closeChat() {
    document.getElementById('chatScreen').style.display = 'none';
    currentChatTargetId = null;
}

// ==================== [7] التسجيل الصوتي ====================
function toggleVoiceRecording() {
    const micBtn = document.getElementById('micBtn');
    if (isRecording) {
        stopRecording();
        micBtn.classList.remove('recording');
        micBtn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
    } else {
        startRecording();
        micBtn.classList.add('recording');
        micBtn.innerHTML = '<i class="fa-solid fa-stop"></i>';
    }
}

function startRecording() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("متصفحك لا يدعم التسجيل الصوتي!");
        return;
    }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        mediaRecorder = new MediaRecorder(stream);
        voiceChunks = [];
        mediaRecorder.ondataavailable = e => voiceChunks.push(e.data);
        mediaRecorder.onstop = () => {
            const blob = new Blob(voiceChunks, { type: 'audio/mp3' });
            const reader = new FileReader();
            reader.onload = function() {
                const audioData = reader.result;
                if (currentChatTargetId) {
                    const user = getActiveAccount();
                    if (!user) return;
                    const key = [user.id, currentChatTargetId].sort().join('_');
                    if (!cloudData.chats[key]) cloudData.chats[key] = [];
                    cloudData.chats[key].push({
                        sender: user.id,
                        text: 'رسالة صوتية',
                        timestamp: Date.now(),
                        type: 'audio',
                        audioData: audioData
                    });
                    updateCloudData();
                    renderMessages(currentChatTargetId);
                    renderChats();
                }
            };
            reader.readAsDataURL(blob);
        };
        mediaRecorder.start();
        isRecording = true;
    }).catch(err => {
        alert("لا يمكن الوصول إلى الميكروفون: " + err.message);
    });
}

function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
    }
}

function playAudio(btn, audioData) {
    const audio = new Audio(audioData);
    audio.play();
    btn.innerHTML = '<i class="fa-solid fa-pause"></i>';
    audio.onended = () => btn.innerHTML = '<i class="fa-solid fa-play"></i>';
    audio.onpause = () => btn.innerHTML = '<i class="fa-solid fa-play"></i>';
}

// ==================== [8] الحالات (ستوري) ====================
function renderStatuses() {
    const container = document.getElementById('statusSlider');
    container.innerHTML = '';
    const user = getActiveAccount();
    if (!user) return;

    const myStatuses = cloudData.statuses.filter(s => s.userId === user.id);
    if (myStatuses.length > 0) {
        const myDiv = document.createElement('div');
        myDiv.className = 'status-circle';
        myDiv.innerHTML = `
            <div class="status-ring" style="border-color: #008069;">
                <div class="status-avatar" style="background-image: url(${user.avatar});"></div>
            </div>
            <div class="status-user-name">حالتك</div>
        `;
        myDiv.addEventListener('click', () => openStatusModal(user.id));
        container.appendChild(myDiv);
    }

    const otherStatuses = cloudData.statuses.filter(s => s.userId !== user.id);
    const uniqueUsers = [...new Set(otherStatuses.map(s => s.userId))];
    uniqueUsers.forEach(uid => {
        const u = cloudData.users.find(usr => usr.id === uid);
        if (!u || u.banned) return;
        const div = document.createElement('div');
        div.className = 'status-circle';
        div.innerHTML = `
            <div class="status-ring">
                <div class="status-avatar" style="background-image: url(${u.avatar});"></div>
            </div>
            <div class="status-user-name">${u.name}</div>
        `;
        div.addEventListener('click', () => openStatusModal(uid));
        container.appendChild(div);
    });
}

function openStatusModal(userId) {
    const statuses = cloudData.statuses.filter(s => s.userId === userId).sort((a,b) => a.timestamp - b.timestamp);
    if (statuses.length === 0) return;

    const overlay = document.getElementById('statusModalOverlay');
    overlay.style.display = 'flex';

    let index = 0;
    const user = cloudData.users.find(u => u.id === userId);
    document.getElementById('statusOwnerName').textContent = user ? user.name : '';

    function showStatus(i) {
        const s = statuses[i];
        if (!s) {
            closeStatusModal();
            return;
        }
        document.getElementById('statusBodyContent').innerHTML = s.content;
        const fill = document.getElementById('statusProgressFill');
        fill.style.width = '0%';
        let progress = 0;
        const interval = setInterval(() => {
            progress += 2;
            fill.style.width = progress + '%';
            if (progress >= 100) {
                clearInterval(interval);
                if (i + 1 < statuses.length) {
                    showStatus(i + 1);
                } else {
                    closeStatusModal();
                }
            }
        }, 100);
    }
    showStatus(0);
}

function closeStatusModal() {
    document.getElementById('statusModalOverlay').style.display = 'none';
    document.getElementById('statusProgressFill').style.width = '0%';
}

function triggerAddTextStatus() {
    const text = prompt("أدخل نص الحالة:");
    if (text && text.trim()) {
        const user = getActiveAccount();
        if (!user) return;
        cloudData.statuses.push({
            userId: user.id,
            content: text,
            timestamp: Date.now()
        });
        updateCloudData();
        renderStatuses();
    }
}

function triggerAddLinkStatus() {
    const link = prompt("أدخل الرابط:");
    if (link && link.trim()) {
        const user = getActiveAccount();
        if (!user) return;
        cloudData.statuses.push({
            userId: user.id,
            content: `<a href="${link}" target="_blank" style="color: #008069; text-decoration: underline;">${link}</a>`,
            timestamp: Date.now()
        });
        updateCloudData();
        renderStatuses();
    }
}

function cleanExpiredStatuses() {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    cloudData.statuses = cloudData.statuses.filter(s => (now - s.timestamp) < day);
}

// ==================== [9] الإعدادات والخلفيات ====================
function openSettingsModal() {
    document.getElementById('settingsModal').style.display = 'flex';
}

function closeSettingsModal() {
    document.getElementById('settingsModal').style.display = 'none';
}

function closeSettingsModalOutside(e) {
    if (e.target === e.currentTarget) closeSettingsModal();
}

function openPatternSelector(type) {
    activeCustomizerType = type;
    document.getElementById('patternSelectorModal').style.display = 'flex';
}

function closePatternSelector() {
    document.getElementById('patternSelectorModal').style.display = 'none';
}

function closePatternSelectorOutside(e) {
    if (e.target === e.currentTarget) closePatternSelector();
}

function applyPattern(num) {
    const bgMap = {
        1: 'radial-gradient(circle, #34495e 10%, transparent 11%), radial-gradient(circle, #34495e 10%, transparent 11%); background-size: 20px 20px; background-position: 0 0, 10px 10px; background-color: #2c3e50;',
        2: 'linear-gradient(45deg, #e5e5e5 25%, transparent 25%), linear-gradient(-45deg, #e5e5e5 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e5e5 75%), linear-gradient(-45deg, transparent 75%, #e5e5e5 75%); background-size: 20px 20px; background-color: #f9f9f9;',
        3: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);',
        4: 'linear-gradient(135deg, #134e5e 0%, #71b280 100%);',
        5: 'repeating-linear-gradient(45deg, #e7f3f0, #e7f3f0 10px, #ffffff 10px, #ffffff 20px);',
        6: '#efeae2;'
    };
    const bg = bgMap[num] || '#ffffff';

    switch (activeCustomizerType) {
        case 'chat':
            document.querySelector('.chat-screen').style.background = bg;
            break;
        case 'list':
            document.querySelector('.chats-list').style.background = bg;
            break;
        case 'banner':
            document.querySelector('.chats-header').style.background = bg;
            break;
        default:
            break;
    }
    closePatternSelector();
}

function addNewAccountSetup() {
    if (localState.accounts.length >= 2) {
        alert("لا يمكنك إضافة أكثر من حسابين على هذا الجهاز.");
        return;
    }
    document.getElementById('page1').style.display = 'flex';
    document.getElementById('page2').style.display = 'none';
    document.getElementById('username').value = '';
    document.getElementById('phone').value = '';
    document.getElementById('password').value = '';
    document.getElementById('imagePreview').style.backgroundImage = `url(${defaultAvatar})`;
    selectedImageBase64 = '';
}

// ==================== [10] دوال الآدمن ====================
function openAdminPanel() {
    const user = getActiveAccount();
    if (!user || !user.isAdmin) {
        alert("ليس لديك صلاحيات الإدارة!");
        return;
    }
    document.getElementById('adminPanelModal').style.display = 'flex';
}

function closeAdminPanel() {
    document.getElementById('adminPanelModal').style.display = 'none';
}

function closeAdminPanelModalOutside(e) {
    if (e.target === e.currentTarget) closeAdminPanel();
}

async function adminVerifyUser() {
    const id = document.getElementById('verifyTargetId').value.trim();
    if (!id) return alert("يرجى إدخال الـ ID!");
    const user = cloudData.users.find(u => u.id === id);
    if (!user) return alert("المستخدم غير موجود!");
    user.verified = true;
    await updateCloudData();
    alert(`تم توثيق المستخدم ${user.name} بنجاح!`);
    document.getElementById('verifyTargetId').value = '';
    applyActiveAccountUI();
    renderChats();
}

async function adminBanUser() {
    const id = document.getElementById('banTargetId').value.trim();
    if (!id) return alert("يرجى إدخال الـ ID!");
    if (id === getActiveAccount().id) return alert("لا يمكنك حظر نفسك!");
    const user = cloudData.users.find(u => u.id === id);
    if (!user) return alert("المستخدم غير موجود!");
    user.banned = true;
    const keys = Object.keys(cloudData.chats).filter(k => k.includes(id));
    keys.forEach(k => delete cloudData.chats[k]);
    await updateCloudData();
    alert(`تم حظر المستخدم ${user.name} بنجاح!`);
    document.getElementById('banTargetId').value = '';
    applyActiveAccountUI();
    renderChats();
}

async function adminUnbanUser() {
    const id = document.getElementById('unbanTargetId').value.trim();
    if (!id) return alert("يرجى إدخال الـ ID!");
    const user = cloudData.users.find(u => u.id === id);
    if (!user) return alert("المستخدم غير موجود!");
    user.banned = false;
    await updateCloudData();
    alert(`تم إلغاء حظر ${user.name} بنجاح!`);
    document.getElementById('unbanTargetId').value = '';
    applyActiveAccountUI();
    renderChats();
}

async function adminSendAlert() {
    const targetId = document.getElementById('alertTargetId').value.trim();
    const msg = document.getElementById('alertMessageText').value.trim();
    if (!targetId || !msg) return alert("يرجى ملء جميع الحقول!");
    const user = cloudData.users.find(u => u.id === targetId);
    if (!user) return alert("المستخدم غير موجود!");

    if (!cloudData.system.pendingAlerts) cloudData.system.pendingAlerts = {};
    if (!cloudData.system.pendingAlerts[targetId]) cloudData.system.pendingAlerts[targetId] = [];
    cloudData.system.pendingAlerts[targetId].push(msg);
    await updateCloudData();
    alert("تم إرسال الإشعار بنجاح!");
    document.getElementById('alertTargetId').value = '';
    document.getElementById('alertMessageText').value = '';
}

function checkForIncomingAlerts() {
    const user = getActiveAccount();
    if (!user) return;
    const alerts = cloudData.system.pendingAlerts?.[user.id] || [];
    if (alerts.length > 0) {
        const msg = alerts[0];
        document.getElementById('alertPopupMessage').textContent = msg;
        document.getElementById('alertPopupOverlay').style.display = 'flex';
        cloudData.system.pendingAlerts[user.id].shift();
        if (cloudData.system.pendingAlerts[user.id].length === 0) {
            delete cloudData.system.pendingAlerts[user.id];
        }
        updateCloudData();
    }
}

function closeAlertPopup() {
    document.getElementById('alertPopupOverlay').style.display = 'none';
}

// ==================== [11] المزامنة الدورية ====================
async function realtimeSync() {
    const oldData = JSON.stringify(cloudData);
    await fetchCloudData();
    const newData = JSON.stringify(cloudData);
    if (oldData !== newData) {
        applyActiveAccountUI();
        if (currentChatTargetId) renderMessages(currentChatTargetId);
    }
    checkForIncomingAlerts();
}

// ==================== [12] دوال مساعدة إضافية ====================
function toggleDropdown() {
    const menu = document.getElementById('dropdownMenu');
    menu.style.display = menu.style.display === 'flex' ? 'none' : 'flex';
}

function toggleSearch() {
    const container = document.getElementById('searchContainer');
    container.style.display = container.style.display === 'block' ? 'none' : 'block';
    document.getElementById('searchBarInput').value = '';
    filterChats();
}

function toggleFabOptions() {
    const options = document.getElementById('fabOptions');
    const btn = document.getElementById('fabMainBtn');
    if (options.style.display === 'flex') {
        options.style.display = 'none';
        btn.classList.remove('open');
    } else {
        options.style.display = 'flex';
        btn.classList.add('open');
    }
}

function triggerCreateGroup() {
    alert("ميزة إنشاء المجموعات قيد التطوير قريباً!");
}

function openProfileModal() {
    document.getElementById('profileModal').style.display = 'flex';
}

function closeProfileModal() {
    document.getElementById('profileModal').style.display = 'none';
}

function closeProfileModalOutside(e) {
    if (e.target === e.currentTarget) closeProfileModal();
}

function saveProfileNameChange(newName) {
    const user = getActiveAccount();
    if (!user) return;
    if (newName.trim()) {
        user.name = newName.trim();
        const cloudUser = cloudData.users.find(u => u.id === user.id);
        if (cloudUser) cloudUser.name = user.name;
        updateCloudData();
        applyActiveAccountUI();
        renderChats();
    }
}

function updateStatus(newStatus) {
    const user = getActiveAccount();
    if (!user) return;
    user.status = newStatus;
    const cloudUser = cloudData.users.find(u => u.id === user.id);
    if (cloudUser) cloudUser.status = newStatus;
    updateCloudData();
}

function openAdminContact() {
    const adminUser = cloudData.users.find(u => u.isAdmin);
    if (adminUser) {
        openChat(adminUser.id);
        toggleDropdown();
    } else {
        alert("لا يوجد مطور مسجل في النظام!");
    }
}

function startAdminChat() {
    closeAdminModal();
    const adminUser = cloudData.users.find(u => u.isAdmin);
    if (adminUser) openChat(adminUser.id);
}

function openTargetProfileFromChat() {
    if (currentChatTargetId) {
        const targetUser = cloudData.users.find(u => u.id === currentChatTargetId);
        if (targetUser) {
            alert(`الاسم: ${targetUser.name}\nرقم الهاتف: ${targetUser.phone}\nID: ${targetUser.id}\nالحالة: ${targetUser.status || 'غير محددة'}`);
        }
    }
}

function openAdminModal() {
    document.getElementById('adminModal').style.display = 'flex';
    triggerGifts();
    announceTikTok();
}

function closeAdminModal() {
    document.getElementById('adminModal').style.display = 'none';
}

function closeAdminModalOutside(e) {
    if (e.target === e.currentTarget) closeAdminModal();
}

function triggerGifts() {
    const container = document.getElementById('giftContainer');
    container.innerHTML = '';
    const emojis = ['🎁', '🎉', '💎', '🌟', '🔥', '⚡', '🎈', '🎊'];
    for (let i = 0; i < 15; i++) {
        const span = document.createElement('span');
        span.className = 'gift-item';
        span.textContent = emojis[Math.floor(Math.random() * emojis.length)];
        span.style.left = Math.random() * 100 + '%';
        span.style.animationDelay = Math.random() * 1.5 + 's';
        container.appendChild(span);
    }
}

function announceTikTok() {
    const elem = document.getElementById('tiktokAnnouncement');
    elem.style.animation = 'none';
    setTimeout(() => {
        elem.style.animation = 'zoomAndSlide 3s ease-out forwards';
    }, 10);
}

// ==================== [13] تشغيل التطبيق ====================
window.onload = function() {
    initApp();
    setTimeout(() => {
        openAdminModal();
    }, 1500);
};