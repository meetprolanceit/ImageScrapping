const express = require('express');
const { setSocket } = require('./socket');
const http = require('http');
const path = require('path');
const fs = require('fs');
const app = express();
const port = 5000;
const server = http.createServer(app);
const socketIo = require('socket.io');
setSocket(socketIo(server));

app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use('/images', express.static(path.join(__dirname, 'images')));

const imagesDir = path.join(__dirname, 'images');

if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir);
}
app.use(require('./routes/image.router'));

server.listen(port, () => {
    console.log(`Server is running on port: ${port}`);
});
