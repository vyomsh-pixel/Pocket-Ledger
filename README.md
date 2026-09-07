# PocketLedger — Wabi-Sabi Financial Architecture

PocketLedger is a modern, high-precision personal finance web application built with Python (Flask) and Vanilla JavaScript. It features multi-user tenant isolation, Firebase Google Authentication, dynamic financial persona analysis, currency customization, starter budget templates, and CSV import/export.

---

## Key Features

- **Multi-Tenant User Isolation**: Secure session authentication with `werkzeug.security` password hashing and user-scoped database records.
- **Firebase & Google Authentication**: 1-click Google Sign-In powered by Firebase Web SDK.
- **Wabi-Sabi Ink Aesthetic**: Charcoal Sumi Ink palette (`#08080A`), IBM Plex Mono figures, and Fraunces editorial typography.
- **Starter Budget Templates**: Choose from pre-configured budget profiles (*Salaried*, *Freelancer*, or *Minimalist*) upon registration.
- **Global Currency Customization**: Switch between USD (`$`), INR (`₹`), EUR (`€`), GBP (`£`), JPY (`¥`), KRW (`₩`), CHF (`Fr`), BRL (`R$`), SEK (`kr`), and PLN (`zł`) instantly.
- **Dynamic Financial Personas**: Automated calculation of user savings rate to assign real-time badges (*Zen Strategist*, *Capital Builder*, *Balanced Allocator*, *Active Restructurer*).
- **Data Export & Import**: Full CSV data portability and audit report printing.
- **100% Full-Width Responsive Design**: Clean grid layout utilizing 100% of display width without letterboxing.

---

## Technology Stack

- **Backend**: Python 3.10+, Flask, SQLite3 (WAL Concurrency)
- **Frontend**: HTML5, Vanilla CSS3 (Custom Design System), Vanilla JS (ES6+)
- **Authentication**: Flask Sessions, Werkzeug Security, Firebase Auth SDK v10
- **Testing**: Python `unittest` framework (27 automated tests)

---

## Local Development Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/vyomsh-pixel/Pocket-Ledger.git
   cd Pocket-Ledger
   ```

2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Run the development server**:
   ```bash
   python app.py
   ```
   Open `http://127.0.0.1:5000` in your web browser.

4. **Run Automated Unit Tests**:
   ```bash
   python -m unittest discover tests
   ```

---

## Production Deployment Guide

### Deploying to Render / Railway / Fly.io

1. Connect your GitHub repository (`https://github.com/vyomsh-pixel/Pocket-Ledger`).
2. Build Command: `pip install -r requirements.txt`
3. Start Command: `gunicorn app:app`
4. Set Environment Variable (Optional): `SECRET_KEY=your_production_secret_key`

---

## License

MIT License. Built for precision financial tracking.
