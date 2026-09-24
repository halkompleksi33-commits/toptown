import express from 'express';
import {createServer} from 'node:http';
import {Server} from 'socket.io';
const app=express(),server=createServer(app),io=new Server(server,{cors:{origin:true}});
app.use(express.json({limit:'200kb'}));app.use(express.static('public'));
const rooms=new Map();
io.on('connection',socket=>{socket.on('join',({room,name})=>{socket.join(room);socket.data={room,name};io.to(room).emit('presence',{name,event:'join'});});socket.on('message',text=>{if(socket.data?.room&&typeof text==='string')io.to(socket.data.room).emit('message',{name:socket.data.name,text,at:Date.now()});});socket.on('disconnect',()=>{if(socket.data?.room)io.to(socket.data.room).emit('presence',{name:socket.data.name,event:'leave'});});});
app.get('/api/health',(_,res)=>res.json({ok:true,runtime:'node',rooms:rooms.size}));server.listen(process.env.PORT||3000,()=>console.log('TopTown Node.js ready'));
