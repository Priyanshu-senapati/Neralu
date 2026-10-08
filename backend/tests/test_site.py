"""FastAPI serves the built website (one command, one port) without shadowing the API."""
from app.config import get_settings


def test_site_serves_files_and_falls_back_to_index_for_deep_links(client, tmp_path, monkeypatch):
    (tmp_path / "index.html").write_text("<!doctype html><title>Neralu</title>")
    (tmp_path / "assets").mkdir()
    (tmp_path / "assets" / "app.js").write_text("console.log(1)")
    monkeypatch.setattr(get_settings(), "frontend_dist", str(tmp_path))

    assert "Neralu" in client.get("/").text
    assert "Neralu" in client.get("/ward").text  # deep link reload
    assert client.get("/assets/app.js").text == "console.log(1)"
    assert client.get("/api/summary").json()["counts"]["registered"] == 401  # API still wins
    assert client.get("/api/nope").status_code == 404
    assert client.get("/assets/old-build.js").status_code == 404  # missing file, not the home page
    assert client.get("/../../etc/passwd").status_code in (200, 404)  # never a file outside the site
    assert "root:" not in client.get("/..%2F..%2Fetc%2Fpasswd").text


def test_without_a_build_only_the_api_answers(client, tmp_path, monkeypatch):
    monkeypatch.setattr(get_settings(), "frontend_dist", str(tmp_path / "missing"))
    assert client.get("/ward").status_code == 404
    assert client.get("/health").json() == {"ok": True}
