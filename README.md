<div align="center">
  <img src="logo.png" alt="DoubtBox Logo" width="100">
  
  # DoubtBox 📦

  **Ask doubts without fear. Teach without guessing.**

  [![Live Demo](https://img.shields.io/badge/Live_Demo-doubtbox--39044.web.app-6366f1?style=for-the-badge&logo=firebase)](https://doubtbox-39044.web.app)
</div>

<br>

**DoubtBox** is an anonymous classroom Q&A system designed to completely remove the friction of asking questions in a classroom setting. It allows teachers to create temporary "rooms" and lets students join instantly via a QR code or a link to ask questions anonymously in real-time.

---

## ✨ Features

### 👨‍🏫 For Teachers
* **Instant Class Creation**: Generate a temporary room with a custom duration and a secure password in seconds.
* **Live Dashboard**: Monitor incoming doubts in real-time without refreshing the page.
* **Quick Sharing**: Instantly share the class via an auto-generated QR Code, "Copy Link" button, or direct WhatsApp integration.
* **Class Management**: Mark questions as "Solved" to automatically update students' screens. Type direct answers to questions.
* **Auto-Expiration**: Classes expire automatically after the set duration for security.

### 🎓 For Students
* **Frictionless Entry**: Scan the teacher's QR code or click an invite link to auto-join the class without creating an account.
* **100% Anonymous**: Students ask questions with zero fear of judgment.
* **Real-time Feedback**: Get instant visual notifications when the teacher marks a doubt as solved or answers it.

---

## 🛠️ Tech Stack

* **Frontend**: HTML5, CSS3 (Modern Glassmorphism UI), Vanilla JavaScript.
* **Backend**: Firebase Firestore (Real-time NoSQL Database).
* **Hosting**: Firebase Hosting with GitHub Actions (CI/CD Automated Deployments).

---

## 🚀 How to Run Locally

If you want to run this project on your local machine for development:

1. **Clone the repository:**
   ```bash
   git clone https://github.com/arshadpatel621/doubtbox.git
   cd doubtbox
   ```

2. **Serve the files:**
   Since this project uses plain HTML/JS and a cloud database, there is no build step. You can use any local web server, for example:
   ```bash
   npx http-server -p 8080
   ```

3. **Open the App:**
   Go to `http://localhost:8080` in your browser.

---

## ☁️ Continuous Deployment (CI/CD)

This project is set up with **GitHub Actions**. Any code that is pushed to the `main` branch will automatically trigger a build and deployment to Firebase Hosting.

To deploy a new update:
```bash
git add .
git commit -m "Your update message"
git push origin main
```
*The live site will update automatically in ~30 seconds.*

---

<div align="center">
  <i>Built with ❤️ for better education.</i>
</div>
