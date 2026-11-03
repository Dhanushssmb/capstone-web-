const path = require('path');

function getBaseUrl() {
    let base = (process.env.BASE_URL || '').trim();
    if (base.endsWith('/')) {
        base = base.slice(0, -1);
    }
    if (base && !base.startsWith('/')) {
        base = '/' + base;
    }
    return base;
}

function url(subpath = '') {
    const base = getBaseUrl();
    const cleanSubpath = String(subpath).replace(/^\/+/, '');
    if (!cleanSubpath) {
        return base || '/';
    }
    return (base ? `${base}/${cleanSubpath}` : `/${cleanSubpath}`);
}

function profileImageUrl(filenameOrData) {
    if (!filenameOrData) {
        return url('assets/images/avatar.svg');
    }
    const val = String(filenameOrData).trim();
    if (val.startsWith('data:image/') || val.startsWith('http://') || val.startsWith('https://')) {
        return val;
    }
    if (/^[a-f0-9]{32}\.(jpg|png|gif|webp)$/i.test(val)) {
        return url(`uploads/profiles/${encodeURIComponent(val)}`);
    }
    return url('assets/images/avatar.svg');
}

function postValue(body, key, maxLength = 5000) {
    const val = body && typeof body[key] === 'string' ? body[key] : '';
    return val.trim().slice(0, maxLength);
}

function readProfileForm(body) {
    return {
        full_name: postValue(body, 'full_name', 120),
        email: postValue(body, 'email', 190).toLowerCase(),
        phone: postValue(body, 'phone', 30),
        college_name: postValue(body, 'college_name', 160),
        department: postValue(body, 'department', 120),
        graduation_year: postValue(body, 'graduation_year', 5),
        current_company: postValue(body, 'current_company', 160),
        job_role: postValue(body, 'job_role', 160),
        current_city: postValue(body, 'current_city', 120),
        linkedin_url: postValue(body, 'linkedin_url', 500),
        bio: postValue(body, 'bio', 1500)
    };
}

function validateProfileFields(input) {
    const errors = [];
    const currentYear = new Date().getFullYear();

    if (!input.full_name || input.full_name.length > 120) {
        errors.push('Enter your full name (up to 120 characters).');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!input.email || !emailRegex.test(input.email) || input.email.length > 190) {
        errors.push('Enter a valid email address.');
    }

    if (input.phone && !/^[0-9+().\-\s]{6,30}$/.test(input.phone)) {
        errors.push('Enter a valid phone number.');
    }

    if (!input.college_name || input.college_name.length > 160) {
        errors.push('Enter your college name (up to 160 characters).');
    }

    if (!input.department || input.department.length > 120) {
        errors.push('Enter your department (up to 120 characters).');
    }

    const year = parseInt(input.graduation_year, 10);
    if (isNaN(year) || year < 1950 || year > currentYear) {
        errors.push(`Enter a graduation year between 1950 and ${currentYear}.`);
    }

    const limits = {
        current_company: 160,
        job_role: 160,
        current_city: 120
    };
    for (const [field, limit] of Object.entries(limits)) {
        if (input[field] && input[field].length > limit) {
            errors.push(`The ${field.replace('_', ' ')} is too long.`);
        }
    }

    if (input.linkedin_url) {
        const isUrl = /^https:\/\/([a-z0-9-]+\.)?linkedin\.com\//i.test(input.linkedin_url);
        if (!isUrl) {
            errors.push('Enter a valid HTTPS LinkedIn profile URL.');
        }
    }

    if (input.bio && input.bio.length > 1500) {
        errors.push('Your biography must be 1,500 characters or fewer.');
    }

    return errors;
}

module.exports = {
    url,
    getBaseUrl,
    profileImageUrl,
    postValue,
    readProfileForm,
    validateProfileFields
};

