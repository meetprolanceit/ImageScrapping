const express = require('express');
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const { URL } = require('url');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const socketIo = require('socket.io');
const http = require('http');
const mime = require('mime-types');
const { log } = require('console');
const regex = /filename="([^"]+)"/;

const app = express();
const port = 5000;
const server = http.createServer(app);
const io = socketIo(server);

app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const imagesDir = path.join(__dirname, 'images');
if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir);
}

app.get('/', (req, res) => {
    res.render('index.ejs');
});

server.listen(port, () => {
    console.log(`Server is running on port: ${port}`);
});

app.post('/images', async (req, res) => {
    const url = req.body.url;
    console.log(`🚀 ~ app.post ~ url:`, url);
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle2' });

        const imageUrls = await page.evaluate(() => {
            const images = document.getElementsByTagName('img');
            const uniqueImageUrls = [];
            [...images].forEach((image) => {
                const imgSrc = image.src;
                if (imgSrc) {
                    const absoluteUrl = imgSrc.startsWith('http') ? imgSrc : new URL(imgSrc, url).href;
                    if (!imgSrc.startsWith('data:') && !uniqueImageUrls.includes(absoluteUrl)) {
                        uniqueImageUrls.push(absoluteUrl);
                    }
                }
            });
            return [...uniqueImageUrls];
        });

        const svgElements = await page.evaluate(() => {
            const svgElement = document.getElementsByTagName('svg');
            const uniqueSvgs = new Set();
            const svgArray = [];
            [...svgElement].forEach((svg) => {
                const svgString = svg.outerHTML;
                if (!uniqueSvgs.has(svgString)) {
                    uniqueSvgs.add(svgString);
                    svgArray.push(svgString);
                }
            });
            return svgArray;
        });

        const totalImages = imageUrls.length + svgElements.length;

        console.log(`🚀 ~ app.post ~ totalImages:`, totalImages, imageUrls.length, svgElements.length);

        io.emit('progress', { progress: 0 });
        let processedImages = 0;

        const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'];
        for (const imageUrl of imageUrls) {
            if (imageUrl.startsWith('http') || imageUrl.startsWith('https')) {
                try {
                    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
                    const contentType = response.headers['content-type'];

                    console.log(`🚀 ~ app.post ~ response:`, response);

                    let fileName = '';
                    const contentDisposition = response.headers['content-disposition'];
                    if (contentDisposition) {
                        let match = contentDisposition.match(regex);
                        if (match) fileName = match[1];
                    } else {
                        fileName = response.config['url'].split('/').pop();
                    }

                    if (!validExtensions.includes(path.extname(fileName))) {
                        fileName = `${response.config['url'].split('/').pop()}.${mime.extension(contentType)}`;
                        console.log(`🚀 ~ app.post ~ fileName:`, fileName);
                        // fileName = `image_${Math.floor(10000 + Math.random() * 90000) + Date.now()}.${mime.extension(
                        //     contentType
                        // )}`;
                    }

                    if (validExtensions.includes(path.extname(fileName))) {
                        const filePath = path.join(imagesDir, fileName);
                        fs.writeFileSync(filePath, response.data);
                        processedImages++;
                        const progress = Math.round((processedImages / totalImages) * 100);
                        // console.log(`🚀 ~ app.post ~ progress:`, progress, processedImages, totalImages);
                        io.emit('progress', { progress });
                    }
                } catch (error) {
                    console.log(`🚀 ~ app.post ~ error:`, error);
                    return res.json({ message: error.message });
                }
            }
        }

        for (const svgString of svgElements) {
            try {
                const svgFileName = `svg_${Math.floor(10000 + Math.random() * 90000) + +Date.now()}.svg`;
                const svgFilePath = path.join(imagesDir, svgFileName);
                fs.writeFileSync(svgFilePath, svgString);
                processedImages++;
                const progress = Math.round((processedImages / totalImages) * 100);
                console.log(`🚀 ~ app.post ~ progress:`, progress, processedImages, totalImages);
                io.emit('progress', { progress });
            } catch (error) {
                // console.log(`🚀 ~ app.post ~ SVG error:`, error);
                return res.json({ message: error.message });
            }
        }
        await browser.close();
        io.emit('done');
        return res.status(200).json({ message: `${processedImages} images saved successfully` });
    } catch (error) {
        console.log(`🚀 ~ app.post ~ error:`, error);
        return res.json({ message: error.message });
    }
});
