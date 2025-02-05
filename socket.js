let socketInstance = null;
export let setSocket = (io) => {
    socketInstance = io;
    socketInstance.on('connection', (socket) => {
        console.log('A user connected');

        socket.on('disconnect', () => {
            console.log('User disconnected');
        });
    });
};

export { socketInstance };