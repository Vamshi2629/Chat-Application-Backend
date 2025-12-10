const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // use STARTTLS
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

// Verify connection configuration
transporter.verify(function (error, success) {
    if (error) {
        console.log('Email server connection error:', error);
    } else {
        console.log('Email server is ready to take our messages');
    }
});

exports.sendOTP = async (email, otp) => {
    // Debug logging for environment variables (masked)
    console.log('Attempting to send email...');
    console.log('EMAIL_USER present:', !!process.env.EMAIL_USER);
    console.log('EMAIL_PASS present:', !!process.env.EMAIL_PASS);

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.error('CRITICAL: Email credentials missing in environment variables');
        throw new Error('Server configuration error: Email credentials missing');
    }

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Your Chat App OTP',
        text: `Your OTP for verification is: ${otp}. It expires in 10 minutes.`,
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`OTP sent to ${email}`);
        console.log('Message ID:', info.messageId);
    } catch (error) {
        console.error('Error sending email detailed:', error);
        if (error.code === 'EAUTH') {
            console.error('Authentication failed. Check EMAIL_USER and EMAIL_PASS.');
        }
        throw new Error('Failed to send OTP: ' + error.message);
    }
};
