// 应用状态管理
window.app = {
    currentUser: null,
    isAdmin: false,
    posts: [],
    users: [],
    bannedUsers: [],
    apiBaseUrl: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? 'http://localhost:3001/api' 
        : '/api', // 生产环境使用相对路径，自动继承当前页面的协议
    refreshInterval: null, // 存储自动刷新的定时器ID
    refreshIntervalTime: 5000, // 刷新间隔时间（毫秒）
    
    // 初始化应用
    init() {
        console.log('应用初始化开始...');
        try {
            this.setupEventListeners();
            this.checkLoginStatus();
            this.startAutoRefresh(); // 启动自动刷新
            console.log('应用初始化完成');
        } catch (error) {
            console.error('应用初始化失败:', error);
        }
    },
    
    // 从本地存储加载数据
    // 移除本地存储方法，现在所有数据都从后端获取,
    
    // 设置事件监听器
    setupEventListeners() {
        console.log('开始设置事件监听器...');
        try {
            // 认证标签切换
            document.getElementById('login-tab').addEventListener('click', () => this.showLoginTab());
            document.getElementById('register-tab').addEventListener('click', () => this.showRegisterTab());
            
            // 表单提交
            document.getElementById('login-form').addEventListener('submit', (e) => this.handleLogin(e));
            document.getElementById('register-form').addEventListener('submit', (e) => this.handleRegister(e));
            document.getElementById('post-form').addEventListener('submit', (e) => this.handlePostSubmit(e));
            
            // 按钮点击
            document.getElementById('admin-login-btn').addEventListener('click', () => this.showAdminLogin());
            document.getElementById('logout-btn').addEventListener('click', () => this.logout());
            document.getElementById('admin-logout-btn').addEventListener('click', () => this.logout());
            
            // 主界面导航按钮
            document.getElementById('view-posts-btn').addEventListener('click', () => this.showPostsView());
            document.getElementById('create-post-btn').addEventListener('click', () => this.showCreatePostView());
            
            // 管理员标签切换
            document.getElementById('posts-tab').addEventListener('click', () => this.showPostsTab());
            document.getElementById('users-tab').addEventListener('click', () => this.showUsersTab());
            
            // 清除缓存按钮
            document.getElementById('clear-cache-btn').addEventListener('click', () => this.clearCache());
            
            console.log('事件监听器设置完成');
        } catch (error) {
            console.error('设置事件监听器失败:', error);
        }
    },
    
    // API请求工具函数
    async apiRequest(endpoint, options = {}) {
        const url = `${this.apiBaseUrl}${endpoint}`;
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json'
            }
        };
        
        // 如果用户已登录，添加认证令牌
        if (this.currentUser && this.currentUser.token) {
            defaultOptions.headers.Authorization = `Bearer ${this.currentUser.token}`;
        }
        
        const config = { ...defaultOptions, ...options };
        
        try {
            console.log('发起API请求:', url, config);
            
            // 对于HTTPS请求，添加一个选项来忽略证书错误（仅用于开发环境）
            if (url.startsWith('https://') && (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')) {
                // 在生产环境中，我们无法直接控制fetch的SSL验证
                // 这里我们只是记录错误，让用户知道需要手动接受证书
                console.warn('警告：使用自签名证书，如果请求失败，请手动在浏览器中接受证书');
            }
            
            const response = await fetch(url, config);
            
            // 检查响应状态
            if (!response.ok) {
                let errorData;
                try {
                    // 尝试解析错误响应为JSON
                    errorData = await response.json();
                } catch (jsonError) {
                    // 如果解析JSON失败，尝试获取文本内容
                    const errorText = await response.text();
                    console.error('API请求失败，非JSON响应:', response.status, errorText);
                    throw new Error(`请求失败，状态码: ${response.status}，服务器返回: ${errorText.substring(0, 100)}`);
                }
                console.error('API请求失败:', response.status, errorData);
                throw new Error(errorData.message || `请求失败，状态码: ${response.status}`);
            }
            
            let data;
            try {
                // 尝试解析成功响应为JSON
                data = await response.json();
            } catch (jsonError) {
                // 如果解析JSON失败，尝试获取文本内容
                const responseText = await response.text();
                console.error('API响应解析失败，非JSON响应:', responseText);
                throw new Error(`服务器返回了非JSON格式的响应: ${responseText.substring(0, 100)}`);
            }
            console.log('API请求成功:', data);
            return data;
        } catch (error) {
            console.error('API请求错误:', error);
            
            // 如果是证书错误，提供更详细的错误信息
            if (error.message.includes('Failed to fetch') || error.name === 'TypeError') {
                // 检查是否是HTTPS证书问题
                if (url.startsWith('https://') && (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')) {
                    throw new Error('无法连接到服务器，可能是由于自签名证书不被信任。请在浏览器中手动访问 https://192.168.3.218:3001 并接受证书警告。');
                } else {
                    throw new Error('无法连接到服务器，请检查网络连接或联系管理员');
                }
            }
            throw error;
        }
    },
    
    // 检查登录状态
    checkLoginStatus() {
        const savedUser = localStorage.getItem('currentUser');
        const savedIsAdmin = localStorage.getItem('isAdmin');
        
        if (savedUser) {
            this.currentUser = JSON.parse(savedUser);
            this.isAdmin = savedIsAdmin === 'true';
            
            // 如果是管理员但没有token，添加token
            if (this.isAdmin && this.currentUser.username === 'admin' && !this.currentUser.token) {
                this.currentUser.token = 'admin-token-123';
                localStorage.setItem('currentUser', JSON.stringify(this.currentUser));
            }
            
            if (this.isAdmin) {
                this.showAdminInterface();
            } else {
                this.showMainInterface();
            }
        }
    },
    
    // 显示登录标签
    showLoginTab() {
        document.getElementById('login-tab').classList.add('active-tab');
        document.getElementById('register-tab').classList.remove('active-tab');
        document.getElementById('login-form').style.display = 'block';
        document.getElementById('register-form').style.display = 'none';
    },
    
    // 显示注册标签
    showRegisterTab() {
        document.getElementById('register-tab').classList.add('active-tab');
        document.getElementById('login-tab').classList.remove('active-tab');
        document.getElementById('register-form').style.display = 'block';
        document.getElementById('login-form').style.display = 'none';
    },
    
    // 处理登录
    async handleLogin(e) {
        e.preventDefault();
        
        const username = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;
        
        // 检查是否是管理员登录
        if (username === 'admin' && password === 'admin123') {
            this.currentUser = { 
                username: 'admin', 
                realname: '管理员',
                token: 'admin-token-123' // 为管理员添加token
            };
            this.isAdmin = true;
            localStorage.setItem('currentUser', JSON.stringify(this.currentUser));
            localStorage.setItem('isAdmin', 'true');
            this.showAdminInterface();
            return;
        }
        
        try {
            // 调用后端登录API
            const response = await this.apiRequest('/login', {
                method: 'POST',
                body: JSON.stringify({ username, password })
            });
            
            this.currentUser = {
                username: response.user.username,
                realname: response.user.realname,
                token: response.token
            };
            this.isAdmin = response.user.isAdmin || false;
            localStorage.setItem('currentUser', JSON.stringify(this.currentUser));
            localStorage.setItem('isAdmin', this.isAdmin.toString());
            
            if (this.isAdmin) {
                this.showAdminInterface();
            } else {
                this.showMainInterface();
            }
        } catch (error) {
            this.showMessage(error.message || '用户名或密码错误，请重试。', 'error');
        }
    },
    
    // 处理注册
    async handleRegister(e) {
        e.preventDefault();
        
        const username = document.getElementById('register-username').value;
        const realname = document.getElementById('register-realname').value;
        const password = document.getElementById('register-password').value;
        const confirmPassword = document.getElementById('register-confirm-password').value;
        
        console.log('注册表单数据:', { username, realname, password: '***', confirmPassword: '***' });
        console.log('API基础URL:', this.apiBaseUrl);
        
        // 验证密码是否匹配
        if (password !== confirmPassword) {
            this.showMessage('两次输入的密码不匹配，请重试。', 'error');
            return;
        }
        
        try {
            console.log('开始注册流程，用户名:', username, '真实姓名:', realname);
            console.log('准备发送注册请求到:', `${this.apiBaseUrl}/register`);
            
            // 调用后端注册API
            const registerResponse = await this.apiRequest('/register', {
                method: 'POST',
                body: JSON.stringify({ username, realname, password })
            });
            
            console.log('注册成功，服务器响应:', registerResponse);
            
            // 注册成功后自动登录
            console.log('开始自动登录流程...');
            const loginResponse = await this.apiRequest('/login', {
                method: 'POST',
                body: JSON.stringify({ username, password })
            });
            
            console.log('登录成功，服务器响应:', loginResponse);
            
            // 保存用户信息
            this.currentUser = {
                username: loginResponse.user.username,
                realname: loginResponse.user.realname,
                token: loginResponse.token
            };
            this.isAdmin = loginResponse.user.isAdmin || false;
            localStorage.setItem('currentUser', JSON.stringify(this.currentUser));
            localStorage.setItem('isAdmin', this.isAdmin.toString());
            
            // 显示成功消息
            this.showMessage('注册并登录成功！', 'success');
            
            // 清空表单
            document.getElementById('register-form').reset();
            
            // 根据用户类型显示相应界面
            if (this.isAdmin) {
                this.showAdminInterface();
            } else {
                this.showMainInterface();
            }
        } catch (error) {
            console.error('注册或登录失败:', error);
            this.showMessage(error.message || '注册失败，请重试。', 'error');
        }
    },
    
    // 处理帖子提交
    async handlePostSubmit(e) {
        e.preventDefault();
        
        const content = document.getElementById('post-content').value;
        
        // 检查内容是否包含违禁词
        if (this.containsBannedWords(content)) {
            this.showMessage('您的内容包含违禁词，请修改后重新提交。', 'error');
            return;
        }
        
        try {
            // 调用后端创建帖子API
            const newPost = await this.apiRequest('/posts', {
                method: 'POST',
                body: JSON.stringify({ content })
            });
            
            // 清空表单
            document.getElementById('post-form').reset();
            
            // 发布成功后切换到倾诉内容界面
            this.showPostsView();
            
            this.showMessage('发布成功！', 'success');
        } catch (error) {
            this.showMessage(error.message || '发布失败，请重试。', 'error');
        }
    },
    
    // 检查内容是否包含违禁词
    containsBannedWords(content) {
        const bannedWords = [
            // 辱骂词汇
            '傻逼', '蠢货', '废物', '垃圾', '去死', '操你', '艹你', '妈的', '他妈', '妈逼', '草泥马',
            '傻B', 'SB', '煞笔', '傻B', '傻比', '脑残', '白痴', '二逼', '贱人', '贱货', '婊子', '妓女',
            '狗屎', '狗屁', '放屁', '屁话', '废物点心', '死全家', '死妈', '死爹', '死全家', '不得好死',
            
            // 色情词汇
            '做爱', '性交', '裸体', '色情', '黄片', 'av', 'a片', '约炮', '一夜情', '嫖娼', '卖淫',
            '阴茎', '阴道', '阴蒂', '乳房', '乳头', '口交', '肛交', '手淫', '自慰', '性高潮', '性欲',
            '情色', '成人', '三级片', '毛片', '黄网', '色情网站', '裸聊', '视频裸聊', '色情服务',
            
            // 政治敏感词
            '政府', '共产党', '国家领导人', '政治', '反动', '颠覆', '游行', '示威', '暴乱', '独立',
            '西藏独立', '台湾独立', '新疆独立', '香港独立', '法轮功', '邪教', '恐怖主义', '极端主义',
            '领导人', '主席', '总理', '国家主席', '国务院', '中央政府', '地方政府', '政权', '体制',
            
            // 暴力词汇
            '杀人', '杀戮', '屠杀', '血腥', '暴力', '打架', '斗殴', '砍人', '捅刀', '枪击', '爆炸',
            '自杀', '自残', '自虐', '虐待', '施暴', '施虐', '家暴', '家庭暴力', '校园暴力', '暴力倾向',
            
            // 赌博词汇
            '赌博', '赌场', '赌钱', '赌球', '赌马', '六合彩', '彩票', '老虎机', '轮盘', '百家乐',
            '赌局', '赌徒', '赌债', '赌王', '赌神', '赌圣', '赌鬼', '赌棍', '赌博网站', '在线赌博',
            
            // 毒品词汇
            '毒品', '吸毒', '贩毒', '海洛因', '冰毒', '摇头丸', '大麻', '鸦片', '可卡因', '吗啡',
            '吸毒者', '毒贩', '毒枭', '毒瘾', '戒毒', '复吸', '注射', '针筒', '毒品交易', '制毒',
            
            // 歧视词汇
            '种族歧视', '性别歧视', '地域歧视', '残疾人', '残废', '瞎子', '聋子', '哑巴', '瘸子',
            '黑人', '白人', '黄种人', '穆斯林', '伊斯兰', '基督教', '佛教', '天主教', '犹太教',
            
            // 其他敏感词
            '诈骗', '传销', '非法集资', '洗钱', '走私', '偷税', '漏税', '逃税', '贪污', '受贿',
            '行贿', '腐败', '权钱交易', '权色交易', '权势', '特权', '黑社会', '黑帮', '黑道',
            '黑客', '病毒', '木马', '钓鱼', '诈骗电话', '诈骗短信', '诈骗邮件', '网络诈骗', '电信诈骗'
        ];
        
        // 预处理内容：移除特殊字符、空格和标点符号，只保留字母、数字和中文
        const normalizedContent = content.toLowerCase()
            .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ''); // 只保留中文、英文和数字
        
        // 检查是否包含违禁词
        return bannedWords.some(word => {
            // 检查原始内容
            if (content.includes(word)) return true;
            // 检查预处理后的内容
            if (normalizedContent.includes(word)) return true;
            // 检查可能的变体（如添加空格或特殊字符）
            const spacedWord = word.split('').join('\\s*'); // 允许字符间有空格
            const regex = new RegExp(spacedWord, 'i');
            if (regex.test(content)) return true;
            return false;
        });
    },
    
    // 显示主界面
    showMainInterface() {
        document.getElementById('auth-container').style.display = 'none';
        document.getElementById('main-container').style.display = 'block';
        document.getElementById('admin-container').style.display = 'none';
        
        document.getElementById('display-username').textContent = this.currentUser.username;
        
        // 默认显示倾诉内容界面
        this.showPostsView();
    },
    
    // 显示管理员界面
    showAdminInterface() {
        document.getElementById('auth-container').style.display = 'none';
        document.getElementById('main-container').style.display = 'none';
        document.getElementById('admin-container').style.display = 'block';
        
        // 确保管理员用户对象中有token
        if (this.currentUser && this.currentUser.username === 'admin' && !this.currentUser.token) {
            this.currentUser.token = 'admin-token-123';
            localStorage.setItem('currentUser', JSON.stringify(this.currentUser));
        }
        
        // 确保用户数据已加载
        if (!this.users || this.users.length === 0) {
            console.log('开始加载管理员数据...');
            this.loadAdminData();
        } else {
            console.log('用户数据已存在，直接渲染界面');
            this.renderAdminPosts();
            this.renderAdminUsers();
        }
    },
    
    // 加载管理员数据
    async loadAdminData() {
        try {
            console.log('开始获取用户列表...');
            // 获取用户列表
            const usersResponse = await this.apiRequest('/users');
            console.log('获取用户列表成功:', usersResponse);
            this.users = usersResponse.users || [];
            this.bannedUsers = usersResponse.bannedUsers || [];
            
            console.log('开始获取帖子列表...');
            // 获取帖子列表
            const postsResponse = await this.apiRequest('/posts');
            console.log('获取帖子列表成功:', postsResponse);
            this.posts = postsResponse;
            
            console.log('开始渲染管理员界面...');
            // 渲染界面
            this.renderAdminPosts();
            this.renderAdminUsers();
            console.log('管理员界面渲染完成');
        } catch (error) {
            console.error('加载管理员数据失败:', error);
            this.showMessage('加载数据失败，请刷新页面重试。', 'error');
        }
    },
    
    // 显示管理员登录
    showAdminLogin() {
        document.getElementById('login-username').value = '';
        document.getElementById('login-password').value = '';
        this.showLoginTab();
        document.getElementById('login-username').focus();
    },
    
    // 退出登录
    logout() {
        this.currentUser = null;
        this.isAdmin = false;
        localStorage.removeItem('currentUser');
        localStorage.removeItem('isAdmin');
        
        document.getElementById('auth-container').style.display = 'block';
        document.getElementById('main-container').style.display = 'none';
        document.getElementById('admin-container').style.display = 'none';
        
        // 重置表单
        document.getElementById('login-form').reset();
        document.getElementById('register-form').reset();
        
        // 停止自动刷新
        this.stopAutoRefresh();
    },
    
    // 显示帖子标签
    showPostsTab() {
        document.getElementById('posts-tab').classList.add('active-tab');
        document.getElementById('users-tab').classList.remove('active-tab');
        document.getElementById('posts-management').style.display = 'block';
        document.getElementById('users-management').style.display = 'none';
    },
    
    // 显示用户标签
    showUsersTab() {
        document.getElementById('users-tab').classList.add('active-tab');
        document.getElementById('posts-tab').classList.remove('active-tab');
        document.getElementById('users-management').style.display = 'block';
        document.getElementById('posts-management').style.display = 'none';
        
        // 确保用户数据已加载
        if (!this.users || this.users.length === 0) {
            this.loadAdminData();
        } else {
            this.renderAdminUsers();
        }
    },
    
    // 显示倾诉内容界面
    showPostsView() {
        document.getElementById('view-posts-btn').classList.add('active-nav-btn');
        document.getElementById('create-post-btn').classList.remove('active-nav-btn');
        document.getElementById('posts-view').style.display = 'block';
        document.getElementById('create-post-view').style.display = 'none';
        
        this.renderPosts();
    },
    
    // 显示发布倾诉界面
    showCreatePostView() {
        document.getElementById('create-post-btn').classList.add('active-nav-btn');
        document.getElementById('view-posts-btn').classList.remove('active-nav-btn');
        document.getElementById('create-post-view').style.display = 'block';
        document.getElementById('posts-view').style.display = 'none';
    },
    
    // 渲染帖子列表
    async renderPosts() {
        const postsContainer = document.getElementById('posts-container');
        postsContainer.innerHTML = '<p>加载中...</p>';
        
        try {
            // 调用后端获取帖子列表API
            const response = await this.apiRequest('/posts');
            this.posts = response;
            
            postsContainer.innerHTML = '';
            
            if (this.posts.length === 0) {
                postsContainer.innerHTML = '<p>暂无倾诉内容，快来发布第一条吧！</p>';
                return;
            }
            
            this.posts.forEach(post => {
                const postElement = document.createElement('div');
                postElement.className = 'post-item';
                
                // 检查当前用户是否已点赞
                const isLiked = post.likes && post.likes.some(like => like.username === this.currentUser.username);
                const likeCount = post.likes ? post.likes.length : 0;
                
                postElement.innerHTML = `
                    <div class="post-header">
                        <div class="post-username">${this.escapeHtml(post.username)}</div>
                        <div class="post-date">${this.formatDate(post.createdAt)}</div>
                    </div>
                    <div class="post-content">${this.escapeHtml(post.content)}</div>
                    <div class="post-actions">
                        <button class="like-btn ${isLiked ? 'liked' : ''}" data-post-id="${post.id}">
                            <div>👍</div> 点赞 (<div class="like-count">${likeCount}</div>)
                        </button>
                        <button class="comment-btn">
                            <div>💬</div> 评论 (<div class="comment-count">${post.comments.length}</div>)
                        </button>
                    </div>
                    <div class="comments-section" style="display: none;">
                        ${this.renderComments(post.comments)}
                        <div class="add-comment">
                            <input type="text" class="comment-input" placeholder="添加评论...">
                            <button class="add-comment-btn" data-post-id="${post.id}">发送</button>
                        </div>
                    </div>
                `;
                
                postsContainer.appendChild(postElement);
                
                // 添加事件监听器
                const commentBtn = postElement.querySelector('.comment-btn');
                const commentsSection = postElement.querySelector('.comments-section');
                const addCommentBtn = postElement.querySelector('.add-comment-btn');
                const commentInput = postElement.querySelector('.comment-input');
                const likeBtn = postElement.querySelector('.like-btn');
                
                commentBtn.addEventListener('click', () => {
                    commentsSection.style.display = commentsSection.style.display === 'none' ? 'block' : 'none';
                });
                
                addCommentBtn.addEventListener('click', () => {
                    this.addComment(post.id, commentInput.value);
                    commentInput.value = '';
                });
                
                commentInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        this.addComment(post.id, commentInput.value);
                        commentInput.value = '';
                    }
                });
                
                // 添加点赞事件监听器
                likeBtn.addEventListener('click', () => {
                    this.toggleLike(post.id);
                });
                
                // 添加点赞数量点击事件，显示点赞列表
                const likeCountElement = postElement.querySelector('.like-count');
                likeCountElement.addEventListener('click', (e) => {
                    e.stopPropagation(); // 阻止事件冒泡，避免触发点赞按钮的点击事件
                    this.showLikesList(post.id);
                });
                
                // 添加点赞数量鼠标样式，提示可点击
                likeCountElement.style.cursor = 'pointer';
                likeCountElement.title = '点击查看点赞用户列表';
            });
        } catch (error) {
            postsContainer.innerHTML = '<p>加载失败，请刷新页面重试。</p>';
            console.error('获取帖子列表失败:', error);
        }
    },
    
    // 渲染评论
    renderComments(comments) {
        if (comments.length === 0) {
            return '<div>暂无评论</div>';
        }
        
        return comments.map(comment => `
            <div class="comment-item">
                <div class="comment-header">
                    <div class="comment-username">${this.escapeHtml(comment.username)}</div>
                    <div class="comment-date">${this.formatDate(comment.createdAt)}</div>
                </div>
                <div class="comment-content">${this.escapeHtml(comment.content)}</div>
            </div>
        `).join('');
    },
    
    // 添加评论
    async addComment(postId, content) {
        if (!content.trim()) {
            this.showMessage('评论内容不能为空。', 'error');
            return;
        }
        
        // 检查评论是否包含违禁词
        if (this.containsBannedWords(content)) {
            this.showMessage('您的评论包含违禁词，请修改后重新提交。', 'error');
            return;
        }
        
        try {
            // 调用后端添加评论API
            await this.apiRequest(`/posts/${postId}/comments`, {
                method: 'POST',
                body: JSON.stringify({ content })
            });
            
            // 重新渲染帖子列表
            this.renderPosts();
            this.showMessage('评论成功！', 'success');
        } catch (error) {
            this.showMessage(error.message || '评论失败，请重试。', 'error');
        }
    },
    
    // 渲染管理员帖子列表
    async renderAdminPosts() {
        const adminPostsContainer = document.getElementById('admin-posts-container');
        adminPostsContainer.innerHTML = '<p>加载中...</p>';
        
        try {
            // 调用后端获取帖子列表API
            const response = await this.apiRequest('/posts');
            this.posts = response;
            
            adminPostsContainer.innerHTML = '';
            
            if (this.posts.length === 0) {
                adminPostsContainer.innerHTML = '<p>暂无内容</p>';
                return;
            }
            
            this.posts.forEach(post => {
                const user = this.users.find(u => u.username === post.username);
                const realname = user ? user.realname : '未知';
                
                const postElement = document.createElement('div');
                postElement.className = 'admin-post-item';
                postElement.innerHTML = `
                    <div class="admin-post-header">
                        <div>
                            <div class="admin-post-username">${this.escapeHtml(post.username)}</div>
                            <div class="admin-post-realname">(${this.escapeHtml(realname)})</div>
                        </div>
                        <div class="admin-post-date">${this.formatDate(post.createdAt)}</div>
                    </div>
                    <div class="admin-post-content">${this.escapeHtml(post.content)}</div>
                    <div class="admin-actions">
                        <button class="delete-btn delete-post-btn" data-post-id="${post.id}">删除帖子</button>
                    </div>
                    <div class="comments-section">
                        ${this.renderAdminComments(post.comments)}
                    </div>
                `;
                
                adminPostsContainer.appendChild(postElement);
            });
            
            // 添加删除帖子事件监听器
            document.querySelectorAll('.delete-post-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const postId = parseInt(e.target.dataset.postId);
                    this.deletePost(postId);
                });
            });
        } catch (error) {
            adminPostsContainer.innerHTML = '<p>加载失败，请刷新页面重试。</p>';
            console.error('获取管理员帖子列表失败:', error);
        }
    },
    
    // 渲染管理员评论列表
    renderAdminComments(comments) {
        if (comments.length === 0) {
            return '<div>暂无评论</div>';
        }
        
        return comments.map(comment => {
            const user = this.users.find(u => u.username === comment.username);
            const realname = user ? user.realname : '未知';
            
            return `
                <div class="comment-item">
                    <div class="comment-header">
                        <div>
                            <div class="comment-username">${this.escapeHtml(comment.username)}</div>
                            <div class="admin-post-realname">(${this.escapeHtml(realname)})</div>
                        </div>
                        <div class="comment-date">${this.formatDate(comment.createdAt)}</div>
                    </div>
                    <div class="comment-content">${this.escapeHtml(comment.content)}</div>
                    <div class="admin-actions">
                        <button class="delete-btn delete-comment-btn" data-post-id="${comment.postId}" data-comment-id="${comment.id}">删除评论</button>
                    </div>
                </div>
            `;
        }).join('');
    },
    
    // 渲染管理员用户列表
    async renderAdminUsers() {
        const adminUsersContainer = document.getElementById('admin-users-container');
        adminUsersContainer.innerHTML = '<p>加载中...</p>';
        
        try {
            console.log('开始获取用户列表...');
            // 调用后端获取用户列表API
            const response = await this.apiRequest('/users');
            console.log('获取用户列表成功:', response);
            
            // 确保response中有users和bannedUsers属性
            this.users = response.users || [];
            this.bannedUsers = response.bannedUsers || [];
            
            console.log('用户数据:', this.users);
            console.log('禁言用户数据:', this.bannedUsers);
            
            adminUsersContainer.innerHTML = '';
            
            if (this.users.length === 0) {
                adminUsersContainer.innerHTML = '<p>暂无用户</p>';
                return;
            }
            
            this.users.forEach(user => {
                const isBanned = this.bannedUsers.includes(user.username);
                
                const userElement = document.createElement('div');
                userElement.className = 'admin-user-item';
                userElement.innerHTML = `
                    <div class="admin-user-header">
                        <div>
                            <div class="admin-user-username">${this.escapeHtml(user.username)}</div>
                            <div class="admin-user-realname">(${this.escapeHtml(user.realname)})</div>
                        </div>
                        <div class="admin-user-date">${this.formatDate(user.createdAt)}</div>
                    </div>
                    <div class="admin-user-status">
                        状态: ${isBanned ? '<div style="color: #e74c3c;">已禁言</div>' : '<div style="color: #27ae60;">正常</div>'}
                    </div>
                    <div class="admin-actions">
                        ${isBanned 
                            ? `<button class="unban-btn unban-user-btn" data-username="${user.username}">解除禁言</button>`
                            : `<button class="ban-btn ban-user-btn" data-username="${user.username}">禁言用户</button>`
                        }
                    </div>
                `;
                
                adminUsersContainer.appendChild(userElement);
            });
            
            // 添加禁言/解除禁言事件监听器
            document.querySelectorAll('.ban-user-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const username = e.target.dataset.username;
                    this.banUser(username);
                });
            });
            
            document.querySelectorAll('.unban-user-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const username = e.target.dataset.username;
                    this.unbanUser(username);
                });
            });
        } catch (error) {
            console.error('获取管理员用户列表失败:', error);
            adminUsersContainer.innerHTML = `<p>加载失败: ${error.message}</p>`;
        }
    },
    
    // 删除帖子
    async deletePost(postId) {
        if (confirm('确定要删除这条帖子吗？')) {
            try {
                // 调用后端删除帖子API
                await this.apiRequest(`/admin/posts/${postId}`, {
                    method: 'DELETE'
                });
                
                this.renderAdminPosts();
                this.showMessage('帖子已删除', 'success');
            } catch (error) {
                this.showMessage(error.message || '删除失败，请重试。', 'error');
            }
        }
    },
    
    // 禁言用户
    async banUser(username) {
        if (confirm(`确定要禁言用户 ${username} 吗？`)) {
            try {
                // 调用后端禁言用户API
                await this.apiRequest(`/admin/users/${username}/ban`, {
                    method: 'POST'
                });
                
                this.renderAdminUsers();
                this.showMessage(`用户 ${username} 已被禁言`, 'success');
            } catch (error) {
                this.showMessage(error.message || '禁言失败，请重试。', 'error');
            }
        }
    },
    
    // 解除禁言
    async unbanUser(username) {
        if (confirm(`确定要解除用户 ${username} 的禁言吗？`)) {
            try {
                // 调用后端解除禁言API
                await this.apiRequest(`/admin/users/${username}/ban`, {
                    method: 'DELETE'
                });
                
                this.renderAdminUsers();
                this.showMessage(`用户 ${username} 的禁言已解除`, 'success');
            } catch (error) {
                this.showMessage(error.message || '解除禁言失败，请重试。', 'error');
            }
        }
    },
    
    // 清除缓存
    async clearCache() {
        if (confirm('确定要清除所有缓存数据吗？此操作将删除所有用户注册信息、社区内所有发布内容及留言等数据，且不可恢复！')) {
            try {
                // 调用后端清除缓存API
                await this.apiRequest('/admin/clear-cache', {
                    method: 'DELETE'
                });
                
                // 刷新当前页面数据
                this.renderAdminPosts();
                this.renderAdminUsers();
                
                this.showMessage('所有缓存数据已清除', 'success');
            } catch (error) {
                this.showMessage(error.message || '清除缓存失败，请重试。', 'error');
            }
        }
    },
    
    // 显示消息
    showMessage(message, type = 'info') {
        // 创建消息元素
        const messageElement = document.createElement('div');
        messageElement.className = `message ${type}`;
        messageElement.textContent = message;
        
        // 设置样式
        messageElement.style.position = 'fixed';
        messageElement.style.top = '20px';
        messageElement.style.left = '50%';
        messageElement.style.transform = 'translateX(-50%)';
        messageElement.style.padding = '12px 24px';
        messageElement.style.borderRadius = '4px';
        messageElement.style.color = 'white';
        messageElement.style.zIndex = '1000';
        messageElement.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
        
        // 根据类型设置背景色
        switch (type) {
            case 'success':
                messageElement.style.backgroundColor = '#27ae60';
                break;
            case 'error':
                messageElement.style.backgroundColor = '#e74c3c';
                break;
            case 'warning':
                messageElement.style.backgroundColor = '#f39c12';
                break;
            default:
                messageElement.style.backgroundColor = '#3498db';
        }
        
        // 添加到页面
        document.body.appendChild(messageElement);
        
        // 3秒后自动移除
        setTimeout(() => {
            messageElement.style.opacity = '0';
            messageElement.style.transition = 'opacity 0.5s ease';
            
            setTimeout(() => {
                document.body.removeChild(messageElement);
            }, 500);
        }, 3000);
    },
    
    // 格式化日期
    formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMins < 1) {
            return '刚刚';
        } else if (diffMins < 60) {
            return `${diffMins}分钟前`;
        } else if (diffHours < 24) {
            return `${diffHours}小时前`;
        } else if (diffDays < 7) {
            return `${diffDays}天前`;
        } else {
            return date.toLocaleDateString('zh-CN');
        }
    },
    
    // 转义HTML
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    
    // 切换点赞状态
    async toggleLike(postId) {
        try {
            // 调用后端点赞API
            const response = await this.apiRequest(`/posts/${postId}/like`, {
                method: 'POST'
            });
            
            // 重新渲染帖子列表以更新点赞状态和数量
            this.renderPosts();
            
            // 显示操作结果消息
            this.showMessage(response.message, 'success');
        } catch (error) {
            this.showMessage(error.message || '点赞操作失败，请重试。', 'error');
        }
    },
    
    // 获取点赞列表
    async showLikesList(postId) {
        try {
            // 调用后端获取点赞列表API
            const likes = await this.apiRequest(`/posts/${postId}/likes`);
            
            // 创建点赞列表弹窗
            const likesListElement = document.createElement('div');
            likesListElement.className = 'likes-list-modal';
            likesListElement.innerHTML = `
                <div class="likes-list-content">
                    <div class="likes-list-header">
                        <h3>点赞用户列表</h3>
                        <button class="close-likes-list">&times;</button>
                    </div>
                    <div class="likes-list-body">
                        ${likes.length === 0 
                            ? '<p>暂无点赞</p>' 
                            : likes.map(like => `
                                <div class="like-user-item">
                                    <div class="like-user-username">${this.escapeHtml(like.username)}</div>
                                    <div class="like-user-realname">${this.escapeHtml(like.realname)}</div>
                                    <div class="like-user-date">${this.formatDate(like.created_at)}</div>
                                </div>
                            `).join('')
                        }
                    </div>
                </div>
            `;
            
            // 添加到页面
            document.body.appendChild(likesListElement);
            
            // 添加关闭事件监听器
            const closeBtn = likesListElement.querySelector('.close-likes-list');
            closeBtn.addEventListener('click', () => {
                document.body.removeChild(likesListElement);
            });
            
            // 点击背景关闭弹窗
            likesListElement.addEventListener('click', (e) => {
                if (e.target === likesListElement) {
                    document.body.removeChild(likesListElement);
                }
            });
        } catch (error) {
            this.showMessage(error.message || '获取点赞列表失败，请重试。', 'error');
        }
    },
    
    // 启动自动刷新
    startAutoRefresh() {
        // 如果已经有定时器在运行，先停止
        this.stopAutoRefresh();
        
        // 设置新的定时器
        this.refreshInterval = setInterval(() => {
            this.refreshData();
        }, this.refreshIntervalTime);
        
        console.log(`已启动自动刷新，每${this.refreshIntervalTime/1000}秒刷新一次数据`);
    },
    
    // 停止自动刷新
    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
            console.log('已停止自动刷新');
        }
    },
    
    // 刷新数据
    async refreshData() {
        console.log('开始自动刷新数据...');
        try {
            // 检查用户是否已登录
            if (!this.currentUser) {
                console.log('用户未登录，停止自动刷新');
                this.stopAutoRefresh();
                return;
            }
            
            console.log('当前用户:', this.currentUser.username, '是否为管理员:', this.isAdmin);
            
            // 根据当前界面刷新相应的数据
            if (this.isAdmin) {
                // 管理员界面：刷新帖子和用户数据
                console.log('刷新管理员数据...');
                await this.loadAdminData();
            } else {
                // 普通用户界面：刷新帖子数据
                console.log('刷新普通用户帖子数据...');
                await this.renderPosts();
            }
            
            console.log('数据刷新完成');
        } catch (error) {
            console.error('自动刷新数据失败:', error);
        }
    }
};

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM已加载，准备初始化应用...');
    app.init();
});