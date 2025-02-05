const router = require('express').Router();
const { scrappingImages, viewPageRender } = require('../controller/image.controller');

router.get('/', viewPageRender);
router.post('/images', scrappingImages);

module.exports = router;
