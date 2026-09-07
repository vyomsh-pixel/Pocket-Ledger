"""
app.py — PocketLedger web application.

This is the ONLY module that knows it's a web app. It is a thin
presentation layer over the exact same services.py, db.py, models.py and
import_export.py used by the original CLI — the business logic was not
touched when the interface changed from a terminal to a browser, which is
"""
import io
import os
from functools import wraps
from flask import Flask, request, jsonify, render_template, send_file, g, session

from expense_tracker.db import get_connection
from expense_tracker import services, import_export
from expense_tracker.services import ValidationError

DB_PATH = os.environ.get("POCKETLEDGER_DB", "pocketledger.db")

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "pocketledger-wabisabi-secret-key-2026")


def db():
    if "conn" not in g:
        g.conn = get_connection(DB_PATH)
    return g.conn


@app.teardown_appcontext
def close_db(exception=None):
    conn = g.pop("conn", None)
    if conn is not None:
        conn.close()


@app.errorhandler(ValidationError)
def handle_validation_error(e):
    return jsonify({"error": str(e)}), 400


@app.errorhandler(Exception)
def handle_general_exception(e):
    return jsonify({"error": str(e)}), 500



def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user_id = session.get("user_id")
        if not user_id:
            return jsonify({"error": "Unauthorized", "auth_required": True}), 401
        return f(user_id, *args, **kwargs)
    return decorated_function


# ---------------------------------------------------------------------------
# Page & Auth Endpoints
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/auth/register", methods=["POST"])
def api_register():
    d = request.get_json(force=True)
    username = d.get("username", "")
    password = d.get("password", "")
    template = d.get("template", "salaried")
    currency = d.get("currency", "$")
    user = services.create_user(db(), username, password, template, currency)
    session["user_id"] = user.id
    return jsonify({"user": {"id": user.id, "username": user.username, "created_at": user.created_at, "currency": user.currency}}), 201


@app.route("/api/auth/login", methods=["POST"])
def api_login():
    d = request.get_json(force=True)
    username = d.get("username", "")
    password = d.get("password", "")
    user = services.authenticate_user(db(), username, password)
    if not user:
        return jsonify({"error": "Invalid username or password."}), 401
    session["user_id"] = user.id
    return jsonify({"user": {"id": user.id, "username": user.username, "created_at": user.created_at, "currency": user.currency}})


@app.route("/api/auth/logout", methods=["POST"])
def api_logout():
    session.clear()
    return jsonify({"message": "Logged out successfully."})


@app.route("/api/auth/google", methods=["POST"])
def api_google_auth():
    d = request.get_json(force=True)
    google_id = d.get("google_id") or d.get("sub") or "google_demo_109283746"
    email = d.get("email") or d.get("username") or "user@gmail.com"
    name = d.get("name", "")
    template = d.get("template", "salaried")
    currency = d.get("currency", "$")

    user = services.get_or_create_google_user(db(), google_id=google_id, email=email, name=name, template=template, currency=currency)
    session["user_id"] = user.id
    return jsonify({"user": {"id": user.id, "username": user.username, "created_at": user.created_at, "currency": user.currency}})



@app.route("/api/auth/me", methods=["GET"])
def api_auth_me():
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"user": None})
    user = services.get_user_by_id(db(), user_id)
    if not user:
        session.clear()
        return jsonify({"user": None})
    return jsonify({"user": {"id": user.id, "username": user.username, "created_at": user.created_at, "currency": user.currency}})


@app.route("/api/user/currency", methods=["PUT"])
@login_required
def api_update_currency(user_id):
    d = request.get_json(force=True)
    new_curr = d.get("currency", "$")
    user = services.update_user_currency(db(), user_id, new_curr)
    return jsonify({"user": {"id": user.id, "username": user.username, "created_at": user.created_at, "currency": user.currency}})



# ---------------------------------------------------------------------------
# Transactions
# ---------------------------------------------------------------------------

@app.route("/api/transactions", methods=["GET"])
@login_required
def api_list_transactions(user_id):
    limit_val = request.args.get("limit")
    offset_val = request.args.get("offset")
    rows = services.list_transactions(
        db(),
        user_id,
        category=request.args.get("category") or None,
        type=request.args.get("type") or None,
        start_date=request.args.get("start") or None,
        end_date=request.args.get("end") or None,
        keyword=request.args.get("q") or None,
        limit=int(limit_val) if limit_val and limit_val.isdigit() else None,
        offset=int(offset_val) if offset_val and offset_val.isdigit() else None,
    )
    return jsonify([vars(r) for r in rows])


@app.route("/api/transactions", methods=["POST"])
@login_required
def api_add_transaction(user_id):
    d = request.get_json(force=True)
    tx = services.add_transaction(
        db(), user_id, date=d.get("date"), type=d.get("type"), category=d.get("category", ""),
        amount=float(d.get("amount", 0)), note=d.get("note", ""),
    )
    alert = _budget_alert_for(user_id, tx.category) if tx.type == "expense" else None
    return jsonify({"transaction": vars(tx), "alert": alert}), 201


@app.route("/api/transactions/<int:tx_id>", methods=["PUT"])
@login_required
def api_edit_transaction(user_id, tx_id):
    d = request.get_json(force=True)
    fields = {k: d[k] for k in ("date", "type", "category", "amount", "note") if k in d}
    if "amount" in fields:
        fields["amount"] = float(fields["amount"])
    tx = services.edit_transaction(db(), user_id, tx_id, **fields)
    alert = _budget_alert_for(user_id, tx.category) if tx.type == "expense" else None
    return jsonify({"transaction": vars(tx), "alert": alert})


@app.route("/api/transactions/<int:tx_id>", methods=["DELETE"])
@login_required
def api_delete_transaction(user_id, tx_id):
    ok = services.delete_transaction(db(), user_id, tx_id)
    if not ok:
        return jsonify({"error": f"No transaction with id {tx_id}."}), 404
    return jsonify({"deleted": tx_id})


@app.route("/api/transactions/<int:tx_id>/duplicate", methods=["POST"])
@login_required
def api_duplicate_transaction(user_id, tx_id):
    tx = services.duplicate_transaction(db(), user_id, tx_id)
    alert = _budget_alert_for(user_id, tx.category) if tx.type == "expense" else None
    return jsonify({"transaction": vars(tx), "alert": alert}), 201


def _budget_alert_for(user_id, category):
    for status in services.budget_status(db(), user_id):
        if status["category"] == category and (status["exceeded"] or status["near_limit"]):
            return status
    return None


# ---------------------------------------------------------------------------
# Budgets
# ---------------------------------------------------------------------------

@app.route("/api/budgets", methods=["GET"])
@login_required
def api_list_budgets(user_id):
    month = request.args.get("month")
    return jsonify(services.budget_status(db(), user_id, month))


@app.route("/api/budgets", methods=["POST"])
@login_required
def api_set_budget(user_id):
    d = request.get_json(force=True)
    b = services.set_budget(db(), user_id, d.get("category", ""), float(d.get("monthly_limit", 0)))
    return jsonify(vars(b)), 201


@app.route("/api/budgets/<path:category>", methods=["DELETE"])
@login_required
def api_delete_budget(user_id, category):
    ok = services.delete_budget(db(), user_id, category)
    if not ok:
        return jsonify({"error": f"No budget set for category '{category}'."}), 404
    return jsonify({"deleted": category})


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------

@app.route("/api/summary", methods=["GET"])
@login_required
def api_summary(user_id):
    return jsonify(services.monthly_summary(db(), user_id, request.args.get("month")))


@app.route("/api/analytics", methods=["GET"])
@login_required
def api_analytics(user_id):
    return jsonify(services.get_analytics_data(db(), user_id, request.args.get("month")))


# ---------------------------------------------------------------------------
# Import / export
# ---------------------------------------------------------------------------

@app.route("/api/export", methods=["GET"])
@login_required
def api_export(user_id):
    path = f"_export_{user_id}.csv"
    import_export.export_csv(db(), user_id, path)
    with open(path, "rb") as f:
        data = f.read()
    if os.path.exists(path):
        os.remove(path)
    return send_file(io.BytesIO(data), mimetype="text/csv", as_attachment=True,
                      download_name="pocketledger_export.csv")


@app.route("/api/import", methods=["POST"])
@login_required
def api_import(user_id):
    file = request.files.get("file")
    if not file:
        return jsonify({"error": "No file uploaded."}), 400
    tmp_path = f"_import_{user_id}.csv"
    file.save(tmp_path)
    successes, errors = import_export.import_csv(db(), user_id, tmp_path)
    if os.path.exists(tmp_path):
        os.remove(tmp_path)
    return jsonify({"imported": successes, "errors": errors})


if __name__ == "__main__":
    app.run(debug=True, port=5000)
