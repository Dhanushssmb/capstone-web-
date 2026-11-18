const multer = require('multer');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
    fileFilter: (req, file, cb) => {
        const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Upload a valid JPEG, PNG, GIF, or WebP image.'));
        }
    }
});

exports.singlePhoto = (fieldName = 'profile_photo') => {
    return (req, res, next) => {
        upload.single(fieldName)(req, res, (err) => {
            if (err) {
                // If it's an API request, return JSON
                if (req.path.startsWith('/api/')) {
                    return res.status(400).json({ success: false, message: err.message });
                }
                // For web forms, attach error to body so controller can display it
                req.uploadError = err.message;
            }
            next();
        });
    };
};
