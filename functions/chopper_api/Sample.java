import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.logging.Level;
import java.util.logging.Logger;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

import org.json.JSONArray;
import org.json.JSONObject;

import com.catalyst.advanced.CatalystAdvancedIOHandler;
import com.zc.component.object.ZCObject;
import com.zc.component.object.ZCRowObject;
import com.zc.component.object.ZCTable;
import com.zc.component.zcql.ZCQL;

public class Sample implements CatalystAdvancedIOHandler {
	private static final Logger LOGGER = Logger.getLogger(Sample.class.getName());

	// JWT expiry: 24 hours in seconds
	private static final long JWT_EXPIRY_SECONDS = 24 * 60 * 60;

	@Override
	public void runner(HttpServletRequest request, HttpServletResponse response) throws Exception {
		handleLocalCors(request, response);

		String method = request.getMethod().toUpperCase();

		// Always handle CORS preflight
		if ("OPTIONS".equalsIgnoreCase(method)) {
			response.setStatus(204);
			return;
		}

		String uri = request.getRequestURI();
		if (uri == null) uri = "";

		// Extract the last path segment for strict route matching.
		// e.g. "/server/chopper_api/execute/auth?foo=bar" -> "auth"
		String path = extractPath(uri);

		LOGGER.log(Level.INFO, "Request Received: Method=" + method + ", URI=" + uri + ", path=" + path);

		try {
			// ── /auth is the only public endpoint ──────────────────────────────────
			if ("auth".equals(path)) {
				if ("POST".equals(method)) {
					handleAuth(request, response);
				} else {
					sendJson(response, 405, new JSONObject().put("error", "Method not allowed"));
				}
				return;
			}

			// ── All other endpoints require a valid JWT ─────────────────────────────
			if (!isValidJwt(request)) {
				sendJson(response, 401, new JSONObject().put("error", "Unauthorized: missing or invalid token"));
				return;
			}

			// ── Route dispatch ──────────────────────────────────────────────────────
			if ("entries".equals(path)) {
				if ("GET".equals(method)) {
					handleGetEntries(request, response);
				} else if ("POST".equals(method) || "PUT".equals(method)) {
					handleSaveEntry(request, response);
				} else if ("DELETE".equals(method)) {
					handleDeleteEntry(request, response);
				} else {
					sendJson(response, 405, new JSONObject().put("error", "Method not allowed"));
				}
			} else if ("reactions".equals(path)) {
				if ("GET".equals(method)) {
					handleGetReactions(request, response);
				} else if ("POST".equals(method) || "PUT".equals(method)) {
					handleSaveReaction(request, response);
				} else if ("DELETE".equals(method)) {
					handleDeleteReaction(request, response);
				} else {
					sendJson(response, 405, new JSONObject().put("error", "Method not allowed"));
				}
			} else if ("triggers".equals(path)) {
				if ("GET".equals(method)) {
					handleGetTriggers(request, response);
				} else if ("POST".equals(method)) {
					handlePostTrigger(request, response);
				} else if ("DELETE".equals(method)) {
					handleDeleteTrigger(request, response);
				} else {
					sendJson(response, 405, new JSONObject().put("error", "Method not allowed"));
				}
			} else if ("dashboard".equals(path) || path.isEmpty()) {
				if ("GET".equals(method)) {
					handleGetDashboard(request, response);
				} else {
					sendJson(response, 405, new JSONObject().put("error", "Method not allowed"));
				}
			} else {
				sendJson(response, 404, new JSONObject().put("error", "Endpoint not found: " + uri));
			}
		} catch (Exception e) {
			LOGGER.log(Level.SEVERE, "Error handling request", e);
			sendJson(response, 500, new JSONObject().put("error", e.getMessage() != null ? e.getMessage() : "Internal server error"));
		}
	}

	// ── Auth Endpoint ─────────────────────────────────────────────────────────────

	private void handleAuth(HttpServletRequest request, HttpServletResponse response) throws Exception {
		JSONObject body = parseBody(request);
		String passphrase = body.optString("passphrase", "").trim();

		if (passphrase.isEmpty()) {
			sendJson(response, 400, new JSONObject().put("error", "passphrase is required"));
			return;
		}

		String storedPassphrase = getEnv("CHOPPER_PASSPHRASE");
		if (storedPassphrase == null || storedPassphrase.isEmpty()) {
			LOGGER.log(Level.SEVERE, "CHOPPER_PASSPHRASE env variable is not set");
			sendJson(response, 500, new JSONObject().put("error", "Server configuration error"));
			return;
		}

		if (!passphrase.equals(storedPassphrase.trim())) {
			sendJson(response, 401, new JSONObject().put("error", "Invalid passphrase"));
			return;
		}

		// Issue JWT
		String jwtSecret = getEnv("CHOPPER_JWT_SECRET");
		if (jwtSecret == null || jwtSecret.isEmpty()) {
			LOGGER.log(Level.SEVERE, "CHOPPER_JWT_SECRET env variable is not set");
			sendJson(response, 500, new JSONObject().put("error", "Server configuration error"));
			return;
		}

		String token = signJwt(jwtSecret);
		JSONObject res = new JSONObject();
		res.put("token", token);
		res.put("expiresIn", JWT_EXPIRY_SECONDS);
		sendJson(response, 200, res);
	}

	// ── JWT Helpers ───────────────────────────────────────────────────────────────

	/**
	 * Signs an HS256 JWT with the given secret.
	 * Payload: { "sub": "chopper-admin", "iat": <now>, "exp": <now + 24h> }
	 */
	private String signJwt(String secret) throws Exception {
		long now = System.currentTimeMillis() / 1000L;
		long exp = now + JWT_EXPIRY_SECONDS;

		String header = base64UrlEncode("{\"alg\":\"HS256\",\"typ\":\"JWT\"}");
		String payload = base64UrlEncode("{\"sub\":\"chopper-admin\",\"iat\":" + now + ",\"exp\":" + exp + "}");

		String signingInput = header + "." + payload;
		String signature = hmacSha256(signingInput, secret);

		return signingInput + "." + signature;
	}

	/**
	 * Validates the JWT from the X-Chopper-Token header.
	 * Returns true if the token is valid and not expired.
	 */
	private boolean isValidJwt(HttpServletRequest request) {
		String token = request.getHeader("X-Chopper-Token");
		if (token == null || token.trim().isEmpty()) {
			return false;
		}
		token = token.trim();

		String jwtSecret = getEnv("CHOPPER_JWT_SECRET");
		if (jwtSecret == null || jwtSecret.isEmpty()) {
			LOGGER.log(Level.SEVERE, "CHOPPER_JWT_SECRET env variable is not set");
			return false;
		}

		try {
			String[] parts = token.split("\\.");
			if (parts.length != 3) return false;

			// Verify signature
			String signingInput = parts[0] + "." + parts[1];
			String expectedSig = hmacSha256(signingInput, jwtSecret);
			if (!expectedSig.equals(parts[2])) {
				LOGGER.log(Level.WARNING, "JWT signature mismatch");
				return false;
			}

			// Verify expiry
			String payloadJson = new String(Base64.getUrlDecoder().decode(padBase64(parts[1])), StandardCharsets.UTF_8);
			JSONObject payloadObj = new JSONObject(payloadJson);
			long exp = payloadObj.optLong("exp", 0);
			long now = System.currentTimeMillis() / 1000L;

			if (exp == 0 || now > exp) {
				LOGGER.log(Level.WARNING, "JWT expired");
				return false;
			}

			return true;
		} catch (Exception e) {
			LOGGER.log(Level.WARNING, "JWT validation error: " + e.getMessage());
			return false;
		}
	}

	private String hmacSha256(String data, String secret) throws Exception {
		Mac mac = Mac.getInstance("HmacSHA256");
		SecretKeySpec keySpec = new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
		mac.init(keySpec);
		byte[] raw = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
		return Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
	}

	private String base64UrlEncode(String input) {
		return Base64.getUrlEncoder().withoutPadding().encodeToString(input.getBytes(StandardCharsets.UTF_8));
	}

	private String padBase64(String base64url) {
		int pad = base64url.length() % 4;
		if (pad == 2) return base64url + "==";
		if (pad == 3) return base64url + "=";
		return base64url;
	}

	// ── Data Handlers ─────────────────────────────────────────────────────────────

	private String formatDateTime(String dt) {
		if (dt == null) return "";
		String clean = dt.trim().replace("T", " ");
		if (clean.length() == 16) {
			clean += ":00";
		}
		return clean;
	}

	private boolean isFutureDateTime(String dtStr) {
		if (dtStr == null || dtStr.trim().isEmpty()) return false;
		try {
			String clean = dtStr.trim().replace("T", " ");
			String datePart = clean.split(" ")[0];
			LocalDate today = LocalDate.now();
			LocalDate targetDate = LocalDate.parse(datePart);
			return targetDate.isAfter(today);
		} catch (Exception e) {
			return false;
		}
	}

	private void handleGetEntries(HttpServletRequest request, HttpServletResponse response) throws Exception {
		ArrayList<ZCRowObject> rows = ZCQL.getInstance().executeQuery("SELECT ROWID, EntryType, ItemName, LoggedAt, Notes, CREATEDTIME FROM LogEntries ORDER BY LoggedAt DESC");
		JSONArray jsonArray = new JSONArray();
		for (ZCRowObject row : rows) {
			JSONObject item = new JSONObject();
			item.put("id", getVal(row, "LogEntries", "ROWID"));
			item.put("entryType", getVal(row, "LogEntries", "EntryType"));
			item.put("itemName", getVal(row, "LogEntries", "ItemName"));
			item.put("loggedAt", getVal(row, "LogEntries", "LoggedAt"));
			item.put("notes", getVal(row, "LogEntries", "Notes"));
			item.put("createdAt", getVal(row, "LogEntries", "CREATEDTIME"));
			jsonArray.put(item);
		}
		sendJson(response, 200, new JSONObject().put("entries", jsonArray));
	}

	private void handleSaveEntry(HttpServletRequest request, HttpServletResponse response) throws Exception {
		JSONObject body = parseBody(request);
		String idStr = body.optString("id", request.getParameter("id"));
		String entryType = body.optString("entryType", "food");
		String itemName = body.optString("itemName", "").trim();
		String loggedAt = formatDateTime(body.optString("loggedAt", ""));
		String notes = body.optString("notes", "");

		if (itemName.isEmpty() || loggedAt.isEmpty()) {
			sendJson(response, 400, new JSONObject().put("error", "itemName and loggedAt are required"));
			return;
		}

		if (isFutureDateTime(loggedAt)) {
			sendJson(response, 400, new JSONObject().put("error", "Cannot add or update log entries for future dates"));
			return;
		}

		ZCTable table = ZCObject.getInstance().getTable("LogEntries");
		ZCRowObject row = ZCRowObject.getInstance();
		row.set("EntryType", entryType);
		row.set("ItemName", itemName);
		row.set("LoggedAt", loggedAt);
		row.set("Notes", notes != null ? notes : "");

		boolean isUpdate = idStr != null && !idStr.isEmpty() && !idStr.equalsIgnoreCase("null");

		if (isUpdate) {
			Long rowId = Long.parseLong(idStr);
			row.set("ROWID", rowId);
			table.updateRows(Collections.singletonList(row));
			JSONObject res = new JSONObject();
			res.put("success", true);
			res.put("id", idStr);
			res.put("itemName", itemName);
			sendJson(response, 200, res);
		} else {
			ZCRowObject insertedRow = table.insertRow(row);
			JSONObject res = new JSONObject();
			res.put("success", true);
			res.put("id", getVal(insertedRow, "LogEntries", "ROWID"));
			res.put("itemName", itemName);
			sendJson(response, 201, res);
		}
	}

	private void handleDeleteEntry(HttpServletRequest request, HttpServletResponse response) throws Exception {
		String idStr = request.getParameter("id");
		if (idStr == null || idStr.isEmpty()) {
			sendJson(response, 400, new JSONObject().put("error", "Missing id parameter"));
			return;
		}
		Long rowId = Long.parseLong(idStr);
		ZCObject.getInstance().getTable("LogEntries").deleteRow(rowId);
		sendJson(response, 200, new JSONObject().put("success", true));
	}

	private void handleGetReactions(HttpServletRequest request, HttpServletResponse response) throws Exception {
		ArrayList<ZCRowObject> rows = ZCQL.getInstance().executeQuery("SELECT ROWID, SymptomStartTime, SeverityLevel, Symptoms, Resolution, ResolvedInMinutes, Notes, CREATEDTIME FROM Reactions ORDER BY SymptomStartTime DESC");
		JSONArray jsonArray = new JSONArray();
		for (ZCRowObject row : rows) {
			JSONObject item = new JSONObject();
			item.put("id", getVal(row, "Reactions", "ROWID"));
			item.put("symptomStartTime", getVal(row, "Reactions", "SymptomStartTime"));
			item.put("severityLevel", getVal(row, "Reactions", "SeverityLevel"));

			Object symptomsRawObj = getVal(row, "Reactions", "Symptoms");
			String symptomsRaw = symptomsRawObj != null ? symptomsRawObj.toString() : "";
			if (!symptomsRaw.isEmpty()) {
				try {
					item.put("symptoms", new JSONArray(symptomsRaw));
				} catch (Exception e) {
					item.put("symptoms", new JSONArray().put(symptomsRaw));
				}
			} else {
				item.put("symptoms", new JSONArray());
			}

			item.put("resolution", getVal(row, "Reactions", "Resolution"));
			item.put("resolvedInMinutes", getVal(row, "Reactions", "ResolvedInMinutes"));
			item.put("notes", getVal(row, "Reactions", "Notes"));
			item.put("createdAt", getVal(row, "Reactions", "CREATEDTIME"));
			jsonArray.put(item);
		}
		sendJson(response, 200, new JSONObject().put("reactions", jsonArray));
	}

	private void handleSaveReaction(HttpServletRequest request, HttpServletResponse response) throws Exception {
		JSONObject body = parseBody(request);
		String idStr = body.optString("id", request.getParameter("id"));
		String symptomStartTime = formatDateTime(body.optString("symptomStartTime", ""));
		int severityLevel = body.optInt("severityLevel", 3);
		JSONArray symptomsArr = body.optJSONArray("symptoms");
		String resolution = body.optString("resolution", "auto");
		int resolvedInMinutes = body.optInt("resolvedInMinutes", 0);
		String notes = body.optString("notes", "");

		if (symptomStartTime.isEmpty()) {
			sendJson(response, 400, new JSONObject().put("error", "symptomStartTime is required"));
			return;
		}

		if (isFutureDateTime(symptomStartTime)) {
			sendJson(response, 400, new JSONObject().put("error", "Cannot add or update reactions for future dates"));
			return;
		}

		ZCTable table = ZCObject.getInstance().getTable("Reactions");
		ZCRowObject row = ZCRowObject.getInstance();
		row.set("SymptomStartTime", symptomStartTime);
		row.set("SeverityLevel", severityLevel);
		if (symptomsArr != null) {
			row.set("Symptoms", symptomsArr.toString());
		} else {
			row.set("Symptoms", "[]");
		}
		row.set("Resolution", resolution);
		row.set("ResolvedInMinutes", resolvedInMinutes);
		row.set("Notes", notes != null ? notes : "");

		boolean isUpdate = idStr != null && !idStr.isEmpty() && !idStr.equalsIgnoreCase("null");

		if (isUpdate) {
			Long rowId = Long.parseLong(idStr);
			row.set("ROWID", rowId);
			table.updateRows(Collections.singletonList(row));
			JSONObject res = new JSONObject();
			res.put("success", true);
			res.put("id", idStr);
			sendJson(response, 200, res);
		} else {
			ZCRowObject insertedRow = table.insertRow(row);
			JSONObject res = new JSONObject();
			res.put("success", true);
			res.put("id", getVal(insertedRow, "Reactions", "ROWID"));
			sendJson(response, 201, res);
		}
	}

	private void handleDeleteReaction(HttpServletRequest request, HttpServletResponse response) throws Exception {
		String idStr = request.getParameter("id");
		if (idStr == null || idStr.isEmpty()) {
			sendJson(response, 400, new JSONObject().put("error", "Missing id parameter"));
			return;
		}
		Long rowId = Long.parseLong(idStr);
		ZCObject.getInstance().getTable("Reactions").deleteRow(rowId);
		sendJson(response, 200, new JSONObject().put("success", true));
	}

	private void handleGetTriggers(HttpServletRequest request, HttpServletResponse response) throws Exception {
		ArrayList<ZCRowObject> rows = ZCQL.getInstance().executeQuery("SELECT ROWID, ItemName, ConfirmedAt FROM ConfirmedTriggers");
		JSONArray jsonArray = new JSONArray();
		for (ZCRowObject row : rows) {
			JSONObject item = new JSONObject();
			item.put("id", getVal(row, "ConfirmedTriggers", "ROWID"));
			item.put("itemName", getVal(row, "ConfirmedTriggers", "ItemName"));
			item.put("confirmedAt", getVal(row, "ConfirmedTriggers", "ConfirmedAt"));
			jsonArray.put(item);
		}
		sendJson(response, 200, new JSONObject().put("triggers", jsonArray));
	}

	private void handlePostTrigger(HttpServletRequest request, HttpServletResponse response) throws Exception {
		JSONObject body = parseBody(request);
		String itemName = body.optString("itemName", "").trim();
		String confirmedAt = formatDateTime(body.optString("confirmedAt", ""));

		if (itemName.isEmpty()) {
			sendJson(response, 400, new JSONObject().put("error", "itemName is required"));
			return;
		}

		ZCRowObject row = ZCRowObject.getInstance();
		row.set("ItemName", itemName);
		row.set("ConfirmedAt", confirmedAt);

		ZCTable table = ZCObject.getInstance().getTable("ConfirmedTriggers");
		ZCRowObject insertedRow = table.insertRow(row);

		JSONObject res = new JSONObject();
		res.put("success", true);
		res.put("id", getVal(insertedRow, "ConfirmedTriggers", "ROWID"));
		sendJson(response, 201, res);
	}

	private void handleDeleteTrigger(HttpServletRequest request, HttpServletResponse response) throws Exception {
		String idStr = request.getParameter("id");
		if (idStr == null || idStr.isEmpty()) {
			sendJson(response, 400, new JSONObject().put("error", "Missing id parameter"));
			return;
		}
		Long rowId = Long.parseLong(idStr);
		ZCObject.getInstance().getTable("ConfirmedTriggers").deleteRow(rowId);
		sendJson(response, 200, new JSONObject().put("success", true));
	}

	private void handleGetDashboard(HttpServletRequest request, HttpServletResponse response) throws Exception {
		JSONObject res = new JSONObject();

		try {
			ArrayList<ZCRowObject> entryRows = ZCQL.getInstance().executeQuery("SELECT ROWID, EntryType, ItemName, LoggedAt, Notes, CREATEDTIME FROM LogEntries ORDER BY LoggedAt DESC");
			JSONArray entriesArray = new JSONArray();
			for (ZCRowObject row : entryRows) {
				JSONObject item = new JSONObject();
				item.put("id", getVal(row, "LogEntries", "ROWID"));
				item.put("entryType", getVal(row, "LogEntries", "EntryType"));
				item.put("itemName", getVal(row, "LogEntries", "ItemName"));
				item.put("loggedAt", getVal(row, "LogEntries", "LoggedAt"));
				item.put("notes", getVal(row, "LogEntries", "Notes"));
				item.put("createdAt", getVal(row, "LogEntries", "CREATEDTIME"));
				entriesArray.put(item);
			}
			res.put("entries", entriesArray);
		} catch (Exception e) {
			LOGGER.log(Level.WARNING, "Failed fetching LogEntries in dashboard", e);
			res.put("entries", new JSONArray());
		}

		try {
			ArrayList<ZCRowObject> reactionRows = ZCQL.getInstance().executeQuery("SELECT ROWID, SymptomStartTime, SeverityLevel, Symptoms, Resolution, ResolvedInMinutes, Notes, CREATEDTIME FROM Reactions ORDER BY SymptomStartTime DESC");
			JSONArray reactionsArray = new JSONArray();
			for (ZCRowObject row : reactionRows) {
				JSONObject item = new JSONObject();
				item.put("id", getVal(row, "Reactions", "ROWID"));
				item.put("symptomStartTime", getVal(row, "Reactions", "SymptomStartTime"));
				item.put("severityLevel", getVal(row, "Reactions", "SeverityLevel"));

				Object symptomsRawObj = getVal(row, "Reactions", "Symptoms");
				String symptomsRaw = symptomsRawObj != null ? symptomsRawObj.toString() : "";
				if (!symptomsRaw.isEmpty()) {
					try {
						item.put("symptoms", new JSONArray(symptomsRaw));
					} catch (Exception ex) {
						item.put("symptoms", new JSONArray().put(symptomsRaw));
					}
				} else {
					item.put("symptoms", new JSONArray());
				}

				item.put("resolution", getVal(row, "Reactions", "Resolution"));
				item.put("resolvedInMinutes", getVal(row, "Reactions", "ResolvedInMinutes"));
				item.put("notes", getVal(row, "Reactions", "Notes"));
				item.put("createdAt", getVal(row, "Reactions", "CREATEDTIME"));
				reactionsArray.put(item);
			}
			res.put("reactions", reactionsArray);
		} catch (Exception e) {
			LOGGER.log(Level.WARNING, "Failed fetching Reactions in dashboard", e);
			res.put("reactions", new JSONArray());
		}

		try {
			ArrayList<ZCRowObject> triggerRows = ZCQL.getInstance().executeQuery("SELECT ROWID, ItemName, ConfirmedAt FROM ConfirmedTriggers");
			JSONArray triggersArray = new JSONArray();
			for (ZCRowObject row : triggerRows) {
				JSONObject item = new JSONObject();
				item.put("id", getVal(row, "ConfirmedTriggers", "ROWID"));
				item.put("itemName", getVal(row, "ConfirmedTriggers", "ItemName"));
				item.put("confirmedAt", getVal(row, "ConfirmedTriggers", "ConfirmedAt"));
				triggersArray.put(item);
			}
			res.put("confirmedTriggers", triggersArray);
		} catch (Exception e) {
			LOGGER.log(Level.WARNING, "Failed fetching ConfirmedTriggers in dashboard", e);
			res.put("confirmedTriggers", new JSONArray());
		}

		// Static user object — no Catalyst auth user needed
		JSONObject userObj = new JSONObject();
		userObj.put("first_name", "Admin");
		userObj.put("email_id", "");
		res.put("user", userObj);

		LOGGER.log(Level.INFO, "Dashboard response size: entries=" +
			res.optJSONArray("entries").length() + " reactions=" +
			res.optJSONArray("reactions").length() + " triggers=" +
			res.optJSONArray("confirmedTriggers").length());
		sendJson(response, 200, res);
	}

	// ── Path Extraction ───────────────────────────────────────────────────────────

	/**
	 * Extracts the last path segment from a URI for strict route matching.
	 * Strips the query string first, then returns the token after the final '/'.
	 * Examples:
	 *   "/server/chopper_api/execute/auth"       -> "auth"
	 *   "/server/chopper_api/execute/entries?id=1" -> "entries"
	 *   "/server/chopper_api/execute/"           -> ""
	 */
	private String extractPath(String uri) {
		// Strip query string
		int queryIdx = uri.indexOf('?');
		String path = queryIdx >= 0 ? uri.substring(0, queryIdx) : uri;

		// Strip trailing slash
		if (path.endsWith("/")) {
			path = path.substring(0, path.length() - 1);
		}

		// Return last segment after the final '/'
		int lastSlash = path.lastIndexOf('/');
		return lastSlash >= 0 ? path.substring(lastSlash + 1) : path;
	}

	// ── Shared Utilities ──────────────────────────────────────────────────────────

	private Object getVal(ZCRowObject row, String tableName, String columnName) {
		try {
			return row.get(tableName, columnName);
		} catch (Exception e) {
			return null;
		}
	}

	private JSONObject parseBody(HttpServletRequest request) throws IOException {
		StringBuilder sb = new StringBuilder();
		BufferedReader reader = request.getReader();
		String line;
		while ((line = reader.readLine()) != null) {
			sb.append(line);
		}
		String bodyStr = sb.toString().trim();
		if (bodyStr.isEmpty()) return new JSONObject();
		try {
			return new JSONObject(bodyStr);
		} catch (Exception e) {
			return new JSONObject();
		}
	}

	private void sendJson(HttpServletResponse response, int status, JSONObject json) throws IOException {
		response.setStatus(status);
		response.setContentType("application/json");
		response.setCharacterEncoding("UTF-8");
		response.getWriter().write(json.toString());
	}


	/**
	 * Retrieves an environment variable. Reads System.getenv() first.
	 * Falls back to reading local .env file ONLY when running locally.
	 */
	private static synchronized String getEnv(String key) {
		String val = System.getenv(key);
		if (val != null && !val.trim().isEmpty()) {
			return val.trim();
		}
		return null;
	}

	/**
	 * Sets CORS headers strictly for local development requests (localhost / 127.0.0.1).
	 * In production, Catalyst Console CORS configuration handles headers automatically.
	 */
	private void handleLocalCors(HttpServletRequest request, HttpServletResponse response) {
		String origin = request.getHeader("Origin");
		if (origin != null && (origin.contains("localhost") || origin.contains("127.0.0.1"))) {
			response.setHeader("Access-Control-Allow-Origin", origin);
			response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
			response.setHeader("Access-Control-Allow-Headers", "X-Chopper-Token, Content-Type, Authorization");
			response.setHeader("Access-Control-Max-Age", "86400");
		}
	}
}