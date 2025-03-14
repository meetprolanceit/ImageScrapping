const puppeteer = require('puppeteer');
const { URL } = require('url');
const axios = require('axios');
const mime = require('mime-types');
const regex = /filename="([^"]+)"/;
const { socketInstance } = require('../socket');
const path = require('path');
const fs = require('fs');
const imagesDir = path.join(__dirname, '../images');

const scrappingImages = async (req, res) => {
    const url = req.body.url;
    console.log(`🚀 ~ app.post ~ url:`, url);
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        if (!fs.existsSync(imagesDir)) {
            fs.mkdirSync(imagesDir);
        }

        const browser = await puppeteer.launch({ headless: true });
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
            return uniqueImageUrls;
        });

        const svgElements = await page.evaluate(() => {
            const svgElement = document.getElementsByTagName('svg');

            console.log(`🚀 ~ svgElements ~ svgElement:`, svgElement);

            const uniqueSvgs = new Set();
            const svgArray = [];
            [...svgElement].forEach((svg, index) => {
                const svgString = svg.outerHTML;
                if (!uniqueSvgs.has(svgString)) {
                    uniqueSvgs.add(svgString);

                    if (svgString.includes('<defs>')) {
                        console.log(`🚀 ~ [...svgElement].forEach ~ svgString:`, svgString);
                    }
                    svgArray.push(svgString);
                }
            });
            return svgArray;
        });
        const totalImages = imageUrls.length + svgElements.length;

        console.log(`🚀 ~ scrappingImages ~ svgElements.length:`, svgElements.length);

        socketInstance.emit('progress', { progress: 0 });
        let processedImages = 0;

        const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'];
        for (const imageUrl of imageUrls) {
            if (imageUrl.startsWith('http') || imageUrl.startsWith('https')) {
                try {
                    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
                    const contentType = response.headers['content-type'];

                    let fileName = '';
                    const contentDisposition = response.headers['content-disposition'];
                    if (contentDisposition) {
                        fileName = contentDisposition.split(`"`)[1].replaceAll('%20', '_');
                    } else {
                        const fileNameString = response.config['url'].split('?')[0];
                        fileName = fileNameString.split('/').pop();
                        fileName = fileName.replaceAll('%20', '_');
                    }

                    if (!validExtensions.includes(path.extname(fileName))) {
                        let fileNameString = response.config['url'].split('/').pop();
                        const uniqueImageString = [];

                        if (fileNameString.length > 250) {
                            const diffLength = fileNameString.length - 250;
                            fileNameString = fileNameString.substring(0, fileNameString.length - diffLength);
                            if (uniqueImageString.includes(fileNameString)) {
                                fileNameString = fileNameString + Math.floor(10000 + Math.random() * 90000);
                                uniqueImageString.push(fileNameString);
                            } else {
                                uniqueImageString.push(fileNameString);
                            }
                        }
                        fileName = `${fileNameString}.${mime.extension(contentType)}`;
                    }

                    if (validExtensions.includes(path.extname(fileName))) {
                        const filePath = path.join(imagesDir, fileName);
                        fs.writeFileSync(filePath, response.data);
                        processedImages++;
                        const progress = Math.round((processedImages / totalImages) * 100);
                        socketInstance.emit('progress', { progress });
                    }
                } catch (error) {
                    console.log(`🚀 ~ app.post ~ error:`, error);
                    return res.json({ message: error.message });
                }
            }
        }

        for (let [index, svgString] of svgElements.entries()) {
            try {
                const svgFileName = `svg_${Math.floor(10000 + Math.random() * 90000) + Date.now()}.svg`;
                const svgFilePath = path.join(imagesDir, svgFileName);
                fs.writeFileSync(svgFilePath, svgString);
                processedImages++;
                const progress = Math.round((processedImages / totalImages) * 100);
                socketInstance.emit('progress', { progress });
            } catch (error) {
                console.log(`🚀 ~ app.post ~ SVG error:`, error);
                return res.json({ message: error.message });
            }
        }
        // await browser.close();
        socketInstance.emit('done');
        return res.redirect('/');
    } catch (error) {
        console.log(`🚀 ~ app.post ~ error:`, error);
        return res.json({ message: error.message });
    }
};

const viewPageRender = (req, res) => {
    fs.readdir(path.join(__dirname, '../images'), (err, files) => {
        if (err) return res.json({ message: err.message });

        const filePromises = files.map((item) => {
            const imagePath = path.join(__dirname, '../images', item);

            return new Promise((resolve, reject) => {
                if (item.includes('.svg')) {
                    fs.readFile(imagePath, 'utf-8', (err, data) => {
                        if (err) return reject(err);
                        resolve(data);
                    });
                } else {
                    resolve(item);
                }
            });
        });
        Promise.all(filePromises)
            .then((filesPathArray) => {
                res.render('index.ejs', { filesPathArray });
            })
            .catch((err) => {
                res.json({ message: err.message });
            });
    });
};

module.exports = { scrappingImages, viewPageRender };
