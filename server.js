import Koa from 'koa'
import { join } from 'path'
import Static from 'koa-static'
import Socket from 'socket.io'

// 保存user
const users = {}
// 保存房间
const rooms = {}
// 保存socket
const sockets = {}

// 题目 
const question = ['花','对牛弹琴', '冰糖葫芦', '刻舟求剑', '口红', '七上八下', '放风筝', '台灯',"理发师", "雷人", "不入虎穴焉得虎子", "仙人掌", "耳机", "打火机", "汉堡", "画饼充饥", "虎头蛇尾", "泪流满面", "捧腹大笑", "画蛇添足", "一手遮天", "掩耳盗铃", "布娃娃", "娃哈哈", "CD", "落地灯", "内裤", "烟斗", "鹦鹉", "钻戒", "网址", "牛肉面"]

// 用户类
class User {
  constructor(name, socre = 0, state=false, isoption=false) {
    this.name = name
    this.socre = socre
    this.state = state
    this.isoption = isoption
  }
  addSocre() {
    this.socre += 2
  }
}
// 房间类
class Room {
  constructor(name) {
    this.name = name
    this.users = []
    this.index = 0
    this.question = ''
  }
  addUser(user) {
    this.users.push(user)
  }
  deleteUser(user) {
    this.users.splice(this.users.indexOf(user), 1)
  }
  init() {
    this.index = 0
    for (let user of this.users) {
      user.state = false
      user.socre = 0
      user.isoption = false
    }
    this.question = ''
  }
}
// 创建一个socket.io
const io = new Socket({
  options : {
    pingTimeout: 10000,
    pingInterval: 5000
  }
})
// 创建koa
const app = new Koa()
// socket注入app
io.attach(app)

// 添加指定静态web文件的Static路径
// Static(root, opts) 这里将public作为根路径
app.use(Static(
  // join 拼接路径 
  // __dirname返回被执行文件夹的绝对路径
  join( __dirname, './public')
))

function getRoomList(rooms) {
  let r = Object.keys(rooms)
  let room = r.map(room => {
    return {room: room, length: rooms[room].users.length}
  })
  return room
}
function getRoomUsers(data) {
  let roomusers
  if (data.room && Object.keys(rooms).length) {
    roomusers = rooms[data.room].users
  }
  return roomusers || []
}

io.on('connection', socket => {
  // 初始化
  socket.on('init', (data) => {
    socket.emit('init', {room: getRoomList(rooms), roomusers: getRoomUsers(data)})
  })
  // 创建账户
  socket.on('createUser', data => {
    let user = new User(data)
    users[data] = user
    sockets[data] = socket
  })
  // 创建房间
  socket.on('createRoom', data => {
    socket.join(data.room, () => {
      let room = new Room(data.room)
      rooms[data.room] = room
    }) 
  })
  // 加入房间
  socket.on('joinRoom', data => {
    // socket api 加入房间 (房间名字， 回调)
    socket.join(data.room, () => {
      let user = new User(data.user)
      rooms[data.room].addUser(user)
      socket.emit('broadcast', {msg: '你已经加入了房间'})
      socket.to(data.room).emit('broadcast', {msg: `${data.user}已经加入了房间`})
      io.in(data.room).emit('joinedRoom', {roomusers: getRoomUsers(data), joinUser: data.user})
      io.emit('roomChange', {room: getRoomList(rooms)})
    })
  })
  // 离开房间
  socket.on('leaveRoom', data => {
    socket.leave(data.room, () => {
      rooms[data.room].deleteUser(data.user)
      if (!rooms[data.room].users.length) {
        delete rooms[data.room]
      }
      socket.emit('broadcast', {msg: '你已经离开了房间'})
      socket.to(data.room).emit('broadcast', {msg: `${data.user}已经离开了房间`})
      io.emit('roomChange', {room: getRoomList(rooms)}) 
      socket.to(data.room).emit('leaveRoom', {roomusers: getRoomUsers(data), leaveUser: data.user})
    })
  })
  // 准备
  socket.on('stateChange', (data) => {
    let users = rooms[data.room].users
    let index = users.findIndex((user) => {
      return user.name === data.user
    })
    users[index].state = data.state
    let allStated = users.every((user) => {
      return user.state === true
    })
    if (allStated && rooms[data.room].users.length === 2) {
      let room = data.room
      let index = rooms[room].index
      let users = rooms[room].users
      let random =  Math.floor(Math.random() * 32)
      users[index].isoption = true
      rooms[room].question = question[random]
      sockets[users[index].name].to(room).emit('broadcast', {msg: `游戏已经开始，本轮你为猜题者`})
      sockets[users[index].name].emit('broadcast', {msg: `游戏已经开始，本轮你为画手`})
      io.to(room).emit('gameStart', {roomusers: getRoomUsers(data)})
      sockets[users[index].name].to(room).emit('guessPage', {question: rooms[room].question.length})
      sockets[users[index].name].emit('paintStart', {index: index, room: room, question: rooms[room].question})
    } else {
      io.to(data.room).emit('stateChanged', {roomusers: getRoomUsers(data)})
    }
  })
  socket.on('paintEnd', data => {
    socket.to(data.room).emit('guessStart')
    socket.to(data.room).emit('broadcast', {msg: '已经绘画完成，请开始猜吧'})
  })
  socket.on('submitAnswer', data => {
    let users = rooms[data.room].users
    let index = users.findIndex((user) => {
      return user.name === data.user
    })
    users[index].isoption = true
    if (data.answer === rooms[data.room].question) {
      users[index].addSocre()
    }
    let allOptioned = users.every((user) => {
      return user.isoption === true
    })
    console.log(allOptioned)
    if (allOptioned) {
      if (rooms[data.room].index === 1) {
        console.log('gameEnd')
        io.to(data.room).emit('gameEnd', {roomusers: getRoomUsers(data)})
        io.to(data.room).emit('broadcast', {msg: `本次游戏已经结束，请观看积分`})
        rooms[data.room].init()
      } else {
        rooms[data.room].index++
        io.to(data.room).emit('guessEnd', {roomusers: getRoomUsers(data)})
        io.to(data.room).emit('broadcast', {msg: `第${rooms[data.room].index}轮已经结束，答案已经公布`})
      }
      sockets[users[index].name].to(data.room).emit('showAnswer', {answer: rooms[data.room].question})
    }
  })

  // 关于房间nat穿透
  // 转发offer
  socket.on('offer', data => {
    socket.to(sockets[data.toUser].id).emit('offer', data)
  })
  // 转发answer
  socket.on('answer', data => {
    socket.to(sockets[data.toUser].id).emit('answer', data)
  })
  // 转发iceCandidate
  socket.on('ice', data => {
    socket.to(sockets[data.toUser].id).emit('ice', data)
  })

})
// 断开连接
io.on('disconnect', socket => {
  // 当该io断开，将user在users中去除
  users.splice(users.indexOf(socket[socket.id]), 1)
  // 删除socket
  delete sockets[socket.id]
})
io.listen(app.listen(3000, () => {
  console.log('server start at port: ' + 3000)
}))