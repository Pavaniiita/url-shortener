const express = require('express');
const router  = express.Router();
const { shortenUrl, getStats, listUrls, deleteUrl } = require('../controllers/urlController');
const { createLimiter } = require('../middleware/rateLimiter');

router.post('/shorten',        createLimiter, shortenUrl);
router.get('/urls',            listUrls);
router.get('/urls/:code/stats', getStats);
router.delete('/urls/:code',   deleteUrl);

module.exports = router;
