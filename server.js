const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = 'your-secret-key'; // 在生产环境中应该使用环境变量

// 中间件
app.use(cors({
  origin: true, // 允许所有来源
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser.json());

// 静态文件服务 - 为Glitch部署添加
app.use(express.static(__dirname));

// 请求日志中间件
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// 初始化数据库
const db = new sqlite3.Database('./confession_box.db');

// 创建表
db.serialize(() => {
    // 用户表
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            realname TEXT NOT NULL,
            password TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // 帖子表
    db.run(`
        CREATE TABLE IF NOT EXISTS posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (username) REFERENCES users (username)
        )
    `);

    // 评论表
    db.run(`
        CREATE TABLE IF NOT EXISTS comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id INTEGER NOT NULL,
            username TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (post_id) REFERENCES posts (id),
            FOREIGN KEY (username) REFERENCES users (username)
        )
    `);

    // 禁言用户表
    db.run(`
        CREATE TABLE IF NOT EXISTS banned_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            reason TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (username) REFERENCES users (username)
        )
    `);

    // 点赞表
    db.run(`
        CREATE TABLE IF NOT EXISTS likes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id INTEGER NOT NULL,
            username TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (post_id) REFERENCES posts (id),
            FOREIGN KEY (username) REFERENCES users (username),
            UNIQUE(post_id, username)
        )
    `);

    // 添加默认管理员账户
    const adminPassword = bcrypt.hashSync('admin123', 10);
    db.run(`
        INSERT OR IGNORE INTO users (username, realname, password) 
        VALUES ('admin', '管理员', ?)
    `, [adminPassword]);
});

// 身份验证中间件
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: '访问令牌缺失' });
    }

    // 特殊处理管理员token
    if (token === 'admin-token-123') {
        req.user = { username: 'admin', realname: '管理员' };
        return next();
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ message: '无效的访问令牌' });
        }
        req.user = user;
        next();
    });
};

// 高一一班同学名单
const CLASS_ONE_STUDENTS = [
    '包庆华', '蔡永亮', '曹小鱼', '陈君慧', '陈俊希', '储守真', '邓敬腾', '付华煦',
    '高煜翔', '郭俊杰', '候丽萍', '胡奕欣', '黄淑妍', '赖宏林', '赖政林', '李烨晗',
    '李梓铃', '梁健宏', '梁晨', '梁芊熠', '林舒婷', '刘恩奇', '刘浩然', '罗健勇',
    '罗芯怡', '任筱青', '谭丽恩', '王烨', '韦天宇', '吴国彬', '吴梦婷', '吴音',
    '吴雨渲', '谢煜彬', '闫钰雯', '杨嘉慧', '杨稀媛', '杨智超', '杨子豪', '詹楷瑞',
    '张嘉文', '张诺琪', '张颖琦', '张智涵', '赵浩欣', '潘政旭', '周俊翰', '朱彦晨'
];

// 管理员身份验证中间件
const authenticateAdmin = (req, res, next) => {
    authenticateToken(req, res, () => {
        if (req.user.username !== 'admin') {
            return res.status(403).json({ message: '需要管理员权限' });
        }
        next();
    });
};

// 用户注册
app.post('/api/register', async (req, res) => {
    const { username, realname, password } = req.body;

    // 验证输入
    if (!username || !realname || !password) {
        return res.status(400).json({ message: '请填写所有必填字段' });
    }

    try {
        // 检查用户名是否已存在
        db.get('SELECT username FROM users WHERE username = ?', [username], (err, row) => {
            if (err) {
                return res.status(500).json({ message: '服务器错误' });
            }

            if (row) {
                return res.status(400).json({ message: '用户名已存在' });
            }

            // 检查真实姓名是否在班级名单中
            if (!CLASS_ONE_STUDENTS.includes(realname)) {
                return res.status(400).json({ message: '真实姓名不在高一一班同学名单中' });
            }

            // 检查真实姓名是否已被注册
            db.get('SELECT realname FROM users WHERE realname = ?', [realname], (err, row) => {
                if (err) {
                    return res.status(500).json({ message: '服务器错误' });
                }

                if (row) {
                    return res.status(400).json({ message: '该真实姓名已被注册' });
                }

                // 加密密码
                const hashedPassword = bcrypt.hashSync(password, 10);

                // 创建新用户
                db.run(
                    'INSERT INTO users (username, realname, password) VALUES (?, ?, ?)',
                    [username, realname, hashedPassword],
                    function(err) {
                        if (err) {
                            return res.status(500).json({ message: '注册失败' });
                        }
                        res.status(201).json({ message: '注册成功' });
                    }
                );
            });
        });
    } catch (error) {
        res.status(500).json({ message: '服务器错误' });
    }
});

// 用户登录
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    // 验证输入
    if (!username || !password) {
        return res.status(400).json({ message: '请填写用户名和密码' });
    }

    // 查找用户
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
        if (err) {
            return res.status(500).json({ message: '服务器错误' });
        }

        if (!user) {
            return res.status(400).json({ message: '用户名或密码错误' });
        }

        // 验证密码
        const isPasswordValid = bcrypt.compareSync(password, user.password);
        if (!isPasswordValid) {
            return res.status(400).json({ message: '用户名或密码错误' });
        }

        // 检查用户是否被禁言
        db.get('SELECT username FROM banned_users WHERE username = ?', [username], (err, bannedUser) => {
            if (err) {
                return res.status(500).json({ message: '服务器错误' });
            }

            if (bannedUser) {
                return res.status(403).json({ message: '您的账户已被禁言，请联系管理员' });
            }

            // 生成JWT令牌
            const token = jwt.sign(
                { username: user.username, realname: user.realname },
                JWT_SECRET,
                { expiresIn: '24h' }
            );

            // 判断是否为管理员
            const isAdmin = username === 'admin';

            res.json({
                message: '登录成功',
                token,
                user: {
                    username: user.username,
                    realname: user.realname,
                    isAdmin
                }
            });
        });
    });
});

// 获取所有帖子
app.get('/api/posts', (req, res) => {
    db.all(
        `SELECT p.*, u.realname 
         FROM posts p 
         JOIN users u ON p.username = u.username 
         ORDER BY p.created_at DESC`,
        (err, rows) => {
            if (err) {
                return res.status(500).json({ message: '获取帖子失败' });
            }
            
            // 为每个帖子获取评论和点赞信息
            const postsWithDetails = [];
            let processedCount = 0;
            
            if (rows.length === 0) {
                return res.json([]);
            }
            
            rows.forEach(post => {
                // 获取评论
                db.all(
                    `SELECT c.*, u.realname 
                     FROM comments c 
                     JOIN users u ON c.username = u.username 
                     WHERE c.post_id = ? 
                     ORDER BY c.created_at ASC`,
                    [post.id],
                    (err, comments) => {
                        if (err) {
                            return res.status(500).json({ message: '获取评论失败' });
                        }
                        
                        // 获取点赞信息
                        db.all(
                            `SELECT l.*, u.realname 
                             FROM likes l 
                             JOIN users u ON l.username = u.username 
                             WHERE l.post_id = ? 
                             ORDER BY l.created_at DESC`,
                            [post.id],
                            (err, likes) => {
                                if (err) {
                                    return res.status(500).json({ message: '获取点赞失败' });
                                }
                                
                                // 添加评论和点赞到帖子对象
                                const postWithDetails = {
                                    ...post,
                                    comments: comments || [],
                                    likes: likes || []
                                };
                                
                                postsWithDetails.push(postWithDetails);
                                processedCount++;
                                
                                // 当所有帖子都处理完毕后返回结果
                                if (processedCount === rows.length) {
                                    res.json(postsWithDetails);
                                }
                            }
                        );
                    }
                );
            });
        }
    );
});

// 创建新帖子
app.post('/api/posts', authenticateToken, (req, res) => {
    const { content } = req.body;
    const username = req.user.username;

    // 验证输入
    if (!content) {
        return res.status(400).json({ message: '内容不能为空' });
    }

    // 检查内容是否包含违禁词
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
    const containsBannedWord = bannedWords.some(word => {
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

    if (containsBannedWord) {
        return res.status(400).json({ message: '您的内容包含违禁词，请修改后重新提交' });
    }

    // 创建帖子
    db.run(
        'INSERT INTO posts (username, content) VALUES (?, ?)',
        [username, content],
        function(err) {
            if (err) {
                return res.status(500).json({ message: '发布失败' });
            }
            res.status(201).json({ message: '发布成功', postId: this.lastID });
        }
    );
});

// 获取帖子的评论
app.get('/api/posts/:postId/comments', (req, res) => {
    const postId = req.params.postId;

    db.all(
        `SELECT c.*, u.realname 
         FROM comments c 
         JOIN users u ON c.username = u.username 
         WHERE c.post_id = ? 
         ORDER BY c.created_at ASC`,
        [postId],
        (err, rows) => {
            if (err) {
                return res.status(500).json({ message: '获取评论失败' });
            }
            res.json(rows);
        }
    );
});

// 添加评论
app.post('/api/posts/:postId/comments', authenticateToken, (req, res) => {
    const postId = req.params.postId;
    const { content } = req.body;
    const username = req.user.username;

    // 验证输入
    if (!content) {
        return res.status(400).json({ message: '评论内容不能为空' });
    }

    // 检查内容是否包含违禁词
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
    const containsBannedWord = bannedWords.some(word => {
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

    if (containsBannedWord) {
        return res.status(400).json({ message: '您的评论包含违禁词，请修改后重新提交' });
    }

    // 添加评论
    db.run(
        'INSERT INTO comments (post_id, username, content) VALUES (?, ?, ?)',
        [postId, username, content],
        function(err) {
            if (err) {
                return res.status(500).json({ message: '评论失败' });
            }
            res.status(201).json({ message: '评论成功', commentId: this.lastID });
        }
    );
});

// 点赞帖子
app.post('/api/posts/:postId/like', authenticateToken, (req, res) => {
    const postId = req.params.postId;
    const username = req.user.username;

    // 检查帖子是否存在
    db.get('SELECT id FROM posts WHERE id = ?', [postId], (err, post) => {
        if (err) {
            return res.status(500).json({ message: '服务器错误' });
        }

        if (!post) {
            return res.status(404).json({ message: '帖子不存在' });
        }

        // 检查用户是否已经点赞
        db.get('SELECT id FROM likes WHERE post_id = ? AND username = ?', [postId, username], (err, like) => {
            if (err) {
                return res.status(500).json({ message: '服务器错误' });
            }

            if (like) {
                return res.status(400).json({ message: '您已经点赞过该帖子' });
            }

            // 添加点赞
            db.run(
                'INSERT INTO likes (post_id, username) VALUES (?, ?)',
                [postId, username],
                function(err) {
                    if (err) {
                        return res.status(500).json({ message: '点赞失败' });
                    }
                    res.status(201).json({ message: '点赞成功', likeId: this.lastID });
                }
            );
        });
    });
});

// 取消点赞
app.delete('/api/posts/:postId/like', authenticateToken, (req, res) => {
    const postId = req.params.postId;
    const username = req.user.username;

    // 检查帖子是否存在
    db.get('SELECT id FROM posts WHERE id = ?', [postId], (err, post) => {
        if (err) {
            return res.status(500).json({ message: '服务器错误' });
        }

        if (!post) {
            return res.status(404).json({ message: '帖子不存在' });
        }

        // 检查用户是否已经点赞
        db.get('SELECT id FROM likes WHERE post_id = ? AND username = ?', [postId, username], (err, like) => {
            if (err) {
                return res.status(500).json({ message: '服务器错误' });
            }

            if (!like) {
                return res.status(400).json({ message: '您尚未点赞该帖子' });
            }

            // 删除点赞
            db.run(
                'DELETE FROM likes WHERE post_id = ? AND username = ?',
                [postId, username],
                function(err) {
                    if (err) {
                        return res.status(500).json({ message: '取消点赞失败' });
                    }
                    res.json({ message: '取消点赞成功' });
                }
            );
        });
    });
});

// 获取帖子的点赞信息
app.get('/api/posts/:postId/likes', (req, res) => {
    const postId = req.params.postId;

    // 检查帖子是否存在
    db.get('SELECT id FROM posts WHERE id = ?', [postId], (err, post) => {
        if (err) {
            return res.status(500).json({ message: '服务器错误' });
        }

        if (!post) {
            return res.status(404).json({ message: '帖子不存在' });
        }

        // 获取点赞信息
        db.all(
            `SELECT l.*, u.realname 
             FROM likes l 
             JOIN users u ON l.username = u.username 
             WHERE l.post_id = ? 
             ORDER BY l.created_at DESC`,
            [postId],
            (err, likes) => {
                if (err) {
                    return res.status(500).json({ message: '获取点赞失败' });
                }
                res.json(likes || []);
            }
        );
    });
});

// 获取所有用户
app.get('/api/users', authenticateToken, (req, res) => {
    // 获取普通用户列表
    db.all(
        `SELECT u.username, u.realname, u.created_at 
         FROM users u
         WHERE u.username != 'admin'
         ORDER BY u.created_at DESC`,
        (err, users) => {
            if (err) {
                return res.status(500).json({ message: '获取用户失败' });
            }
            
            // 获取禁言用户列表
            db.all(
                `SELECT username FROM banned_users`,
                (err, bannedRows) => {
                    if (err) {
                        return res.status(500).json({ message: '获取禁言用户失败' });
                    }
                    
                    const bannedUsers = bannedRows.map(row => row.username);
                    res.json({
                        users,
                        bannedUsers
                    });
                }
            );
        }
    );
});

// 管理员获取所有帖子
app.get('/api/admin/posts', authenticateAdmin, (req, res) => {
    db.all(
        `SELECT p.*, u.realname 
         FROM posts p 
         JOIN users u ON p.username = u.username 
         ORDER BY p.created_at DESC`,
        (err, rows) => {
            if (err) {
                return res.status(500).json({ message: '获取帖子失败' });
            }
            
            // 为每个帖子获取评论和点赞信息
            const postsWithDetails = [];
            let processedCount = 0;
            
            if (rows.length === 0) {
                return res.json([]);
            }
            
            rows.forEach(post => {
                // 获取评论
                db.all(
                    `SELECT c.*, u.realname 
                     FROM comments c 
                     JOIN users u ON c.username = u.username 
                     WHERE c.post_id = ? 
                     ORDER BY c.created_at ASC`,
                    [post.id],
                    (err, comments) => {
                        if (err) {
                            return res.status(500).json({ message: '获取评论失败' });
                        }
                        
                        // 获取点赞信息
                        db.all(
                            `SELECT l.*, u.realname 
                             FROM likes l 
                             JOIN users u ON l.username = u.username 
                             WHERE l.post_id = ? 
                             ORDER BY l.created_at DESC`,
                            [post.id],
                            (err, likes) => {
                                if (err) {
                                    return res.status(500).json({ message: '获取点赞失败' });
                                }
                                
                                // 添加评论和点赞到帖子对象
                                const postWithDetails = {
                                    ...post,
                                    comments: comments || [],
                                    likes: likes || []
                                };
                                
                                postsWithDetails.push(postWithDetails);
                                processedCount++;
                                
                                // 当所有帖子都处理完毕后返回结果
                                if (processedCount === rows.length) {
                                    res.json(postsWithDetails);
                                }
                            }
                        );
                    }
                );
            });
        }
    );
});

// 管理员删除帖子
app.delete('/api/admin/posts/:postId', authenticateAdmin, (req, res) => {
    const postId = req.params.postId;

    // 首先删除帖子下的所有评论
    db.run('DELETE FROM comments WHERE post_id = ?', [postId], (err) => {
        if (err) {
            return res.status(500).json({ message: '删除评论失败' });
        }

        // 然后删除帖子
        db.run('DELETE FROM posts WHERE id = ?', [postId], (err) => {
            if (err) {
                return res.status(500).json({ message: '删除帖子失败' });
            }
            res.json({ message: '帖子已删除' });
        });
    });
});

// 管理员获取所有用户
app.get('/api/admin/users', authenticateAdmin, (req, res) => {
    db.all(
        `SELECT u.username, u.realname, u.created_at, 
         CASE WHEN bu.username IS NOT NULL THEN 1 ELSE 0 END as is_banned
         FROM users u
         LEFT JOIN banned_users bu ON u.username = bu.username
         WHERE u.username != 'admin'
         ORDER BY u.created_at DESC`,
        (err, rows) => {
            if (err) {
                return res.status(500).json({ message: '获取用户失败' });
            }
            res.json(rows);
        }
    );
});

// 管理员禁言用户
app.post('/api/admin/users/:username/ban', authenticateAdmin, (req, res) => {
    const username = req.params.username;
    const { reason } = req.body;

    // 检查用户是否存在
    db.get('SELECT username FROM users WHERE username = ?', [username], (err, user) => {
        if (err) {
            return res.status(500).json({ message: '服务器错误' });
        }

        if (!user) {
            return res.status(404).json({ message: '用户不存在' });
        }

        // 检查用户是否已被禁言
        db.get('SELECT username FROM banned_users WHERE username = ?', [username], (err, bannedUser) => {
            if (err) {
                return res.status(500).json({ message: '服务器错误' });
            }

            if (bannedUser) {
                return res.status(400).json({ message: '用户已被禁言' });
            }

            // 禁言用户
            db.run(
                'INSERT INTO banned_users (username, reason) VALUES (?, ?)',
                [username, reason],
                (err) => {
                    if (err) {
                        return res.status(500).json({ message: '禁言失败' });
                    }
                    res.json({ message: '用户已被禁言' });
                }
            );
        });
    });
});

// 管理员解除禁言
app.delete('/api/admin/users/:username/ban', authenticateAdmin, (req, res) => {
    const username = req.params.username;

    // 检查用户是否存在
    db.get('SELECT username FROM users WHERE username = ?', [username], (err, user) => {
        if (err) {
            return res.status(500).json({ message: '服务器错误' });
        }

        if (!user) {
            return res.status(404).json({ message: '用户不存在' });
        }

        // 检查用户是否被禁言
        db.get('SELECT username FROM banned_users WHERE username = ?', [username], (err, bannedUser) => {
            if (err) {
                return res.status(500).json({ message: '服务器错误' });
            }

            if (!bannedUser) {
                return res.status(400).json({ message: '用户未被禁言' });
            }

            // 解除禁言
            db.run('DELETE FROM banned_users WHERE username = ?', [username], (err) => {
                if (err) {
                    return res.status(500).json({ message: '解除禁言失败' });
                }
                res.json({ message: '用户禁言已解除' });
            });
        });
    });
});

// 管理员清除缓存
app.delete('/api/admin/clear-cache', authenticateAdmin, (req, res) => {
    // 使用Promise来处理异步操作
    Promise.resolve()
        .then(() => {
            return new Promise((resolve, reject) => {
                // 检查是否已经在事务中
                db.run('BEGIN TRANSACTION', (err) => {
                    if (err) {
                        // 如果已经在事务中，直接继续
                        if (err.code === 'SQLITE_ERROR' && err.message.includes('cannot start a transaction within a transaction')) {
                            resolve();
                        } else {
                            reject(err);
                        }
                    } else {
                        resolve();
                    }
                });
            });
        })
        .then(() => {
            return new Promise((resolve, reject) => {
                // 删除所有评论
                db.run('DELETE FROM comments', (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
        })
        .then(() => {
            return new Promise((resolve, reject) => {
                // 删除所有帖子
                db.run('DELETE FROM posts', (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
        })
        .then(() => {
            return new Promise((resolve, reject) => {
                // 删除所有点赞记录
                db.run('DELETE FROM likes', (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
        })
        .then(() => {
            return new Promise((resolve, reject) => {
                // 删除所有禁言记录
                db.run('DELETE FROM banned_users', (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
        })
        .then(() => {
            return new Promise((resolve, reject) => {
                // 删除所有非管理员用户
                db.run("DELETE FROM users WHERE username != 'admin'", (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
        })
        .then(() => {
            return new Promise((resolve, reject) => {
                // 重置自增ID
                db.run("DELETE FROM sqlite_sequence WHERE name IN ('likes', 'comments', 'posts', 'users')", (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
        })
        .then(() => {
            return new Promise((resolve, reject) => {
                // 提交事务
                db.run('COMMIT', (err) => {
                    if (err) {
                        // 如果没有活动事务，直接继续
                        if (err.code === 'SQLITE_ERROR' && err.message.includes('cannot commit - no transaction is active')) {
                            resolve();
                        } else {
                            reject(err);
                        }
                    } else {
                        resolve();
                    }
                });
            });
        })
        .then(() => {
            res.json({ message: '所有缓存数据已清除' });
        })
        .catch((err) => {
            console.error('清除缓存失败:', err);
            // 回滚事务
            db.run('ROLLBACK', (rollbackErr) => {
                // 如果没有活动事务，忽略错误
                if (rollbackErr && rollbackErr.code === 'SQLITE_ERROR' && rollbackErr.message.includes('cannot rollback - no transaction is active')) {
                    // 忽略这个错误
                }
            });
            res.status(500).json({ message: '清除缓存失败' });
        });
});

// 点赞相关API
// 点赞或取消点赞帖子
app.post('/api/posts/:postId/like', authenticateToken, (req, res) => {
    const postId = req.params.postId;
    const username = req.user.username;

    // 检查帖子是否存在
    db.get('SELECT id FROM posts WHERE id = ?', [postId], (err, post) => {
        if (err) {
            return res.status(500).json({ message: '服务器错误' });
        }

        if (!post) {
            return res.status(404).json({ message: '帖子不存在' });
        }

        // 检查用户是否已经点赞
        db.get('SELECT id FROM likes WHERE post_id = ? AND username = ?', [postId, username], (err, like) => {
            if (err) {
                return res.status(500).json({ message: '服务器错误' });
            }

            if (like) {
                // 如果已经点赞，则取消点赞
                db.run('DELETE FROM likes WHERE post_id = ? AND username = ?', [postId, username], (err) => {
                    if (err) {
                        return res.status(500).json({ message: '取消点赞失败' });
                    }
                    res.json({ message: '取消点赞成功', liked: false });
                });
            } else {
                // 如果未点赞，则添加点赞
                db.run('INSERT INTO likes (post_id, username) VALUES (?, ?)', [postId, username], (err) => {
                    if (err) {
                        return res.status(500).json({ message: '点赞失败' });
                    }
                    res.json({ message: '点赞成功', liked: true });
                });
            }
        });
    });
});

// 获取帖子的点赞列表
app.get('/api/posts/:postId/likes', authenticateToken, (req, res) => {
    const postId = req.params.postId;

    // 检查帖子是否存在
    db.get('SELECT id FROM posts WHERE id = ?', [postId], (err, post) => {
        if (err) {
            return res.status(500).json({ message: '服务器错误' });
        }

        if (!post) {
            return res.status(404).json({ message: '帖子不存在' });
        }

        // 获取点赞列表
        db.all(
            `SELECT l.username, u.realname, l.created_at
             FROM likes l
             JOIN users u ON l.username = u.username
             WHERE l.post_id = ?
             ORDER BY l.created_at DESC`,
            [postId],
            (err, likes) => {
                if (err) {
                    return res.status(500).json({ message: '获取点赞列表失败' });
                }
                res.json(likes);
            }
        );
    });
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`服务器运行在端口 ${PORT}`);
    console.log(`如果是在Glitch上运行，请访问提供的URL`);
});