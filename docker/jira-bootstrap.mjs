#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

class JiraRequestError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = "JiraRequestError";
    this.status = status;
    this.body = body;
  }
}

const config = loadConfig();

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  console.log(`Waiting for Jira at ${config.baseUrl}`);
  await waitForAuthenticatedJira();

  const currentUser = await jiraRequest("/rest/api/2/myself");
  const projectResult = await ensureProject(currentUser);
  const board = await ensureBoard(projectResult.project, projectResult.created);
  const issues = await ensureSampleIssues(projectResult.project.key);
  const pat = config.createPat ? await ensurePat() : null;

  const output = {
    generatedAt: new Date().toISOString(),
    baseUrl: config.publicBaseUrl,
    username: config.username,
    project: {
      id: projectResult.project.id,
      key: projectResult.project.key,
      name: projectResult.project.name,
      created: projectResult.created,
    },
    board,
    issues,
    pat,
    agileToolsConnection: {
      baseUrl: config.publicBaseUrl,
      boardId: board.id,
      projectKey: projectResult.project.key,
      token: pat?.token ?? null,
      username: config.username,
    },
  };

  await writeBootstrapOutput(output);
  console.log(`Bootstrap summary written to ${config.outputPath}`);
}

function loadConfig() {
  const projectKey = requiredEnv("JIRA_BOOTSTRAP_PROJECT_KEY", "AGILE").toUpperCase();

  return {
    baseUrl: normalizeUrl(requiredEnv("JIRA_BOOTSTRAP_BASE_URL", "http://jira:8080")),
    publicBaseUrl: normalizeUrl(
      requiredEnv("JIRA_BOOTSTRAP_PUBLIC_BASE_URL", "http://localhost:8080"),
    ),
    username: requiredEnv("JIRA_BOOTSTRAP_USERNAME"),
    password: requiredEnv("JIRA_BOOTSTRAP_PASSWORD"),
    projectKey,
    projectName: requiredEnv("JIRA_BOOTSTRAP_PROJECT_NAME", "Agile Tools Local Demo"),
    boardName: requiredEnv("JIRA_BOOTSTRAP_BOARD_NAME", "Agile Tools Kanban"),
    filterName: requiredEnv(
      "JIRA_BOOTSTRAP_FILTER_NAME",
      "Agile Tools Kanban Filter",
    ),
    issueLabel: requiredEnv("JIRA_BOOTSTRAP_ISSUE_LABEL", "agile-tools-bootstrap"),
    sampleIssueCount: readPositiveInt("JIRA_BOOTSTRAP_SAMPLE_ISSUE_COUNT", 3),
    waitTimeoutMs: readPositiveInt("JIRA_BOOTSTRAP_WAIT_TIMEOUT_MS", 600000),
    waitIntervalMs: readPositiveInt("JIRA_BOOTSTRAP_WAIT_INTERVAL_MS", 5000),
    createPat: readBoolean("JIRA_BOOTSTRAP_CREATE_PAT", true),
    patName: requiredEnv("JIRA_BOOTSTRAP_PAT_NAME", "agile-tools-local"),
    patExpirationDays: readPositiveInt(
      "JIRA_BOOTSTRAP_PAT_EXPIRATION_DAYS",
      30,
    ),
    outputPath: requiredEnv(
      "JIRA_BOOTSTRAP_OUTPUT_PATH",
      "/bootstrap-output/jira-bootstrap.json",
    ),
  };
}

function requiredEnv(name, defaultValue) {
  const value = process.env[name] ?? defaultValue;

  if (!value || value.trim().length === 0) {
    throw new Error(`${name} is required for Jira bootstrap`);
  }

  return value.trim();
}

function readPositiveInt(name, defaultValue) {
  const raw = process.env[name];

  if (!raw || raw.trim().length === 0) {
    return defaultValue;
  }

  const parsed = Number.parseInt(raw, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
}

function readBoolean(name, defaultValue) {
  const raw = process.env[name];

  if (!raw || raw.trim().length === 0) {
    return defaultValue;
  }

  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}

function normalizeUrl(value) {
  return value.replace(/\/+$/, "");
}

function buildUrl(path, query) {
  const url = new URL(path, `${config.baseUrl}/`);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }

  return url;
}

function createAuthHeader(auth) {
  if (!auth || auth.type === "basic") {
    return `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`;
  }

  if (auth.type === "bearer") {
    return `Bearer ${auth.token}`;
  }

  throw new Error(`Unsupported auth type: ${auth.type}`);
}

async function jiraRequest(path, options = {}) {
  const { method = "GET", query, body, auth, headers } = options;
  const response = await fetch(buildUrl(path, query), {
    method,
    headers: {
      Accept: "application/json",
      Authorization: createAuthHeader(auth),
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 204) {
    return null;
  }

  const responseBody = await parseResponseBody(response);

  if (!response.ok) {
    throw new JiraRequestError(
      `Jira request failed (${response.status}) for ${method} ${path}`,
      response.status,
      responseBody,
    );
  }

  return responseBody;
}

async function parseResponseBody(response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  return response.text();
}

function isStatus(error, status) {
  return error instanceof JiraRequestError && error.status === status;
}

async function waitForAuthenticatedJira() {
  const deadline = Date.now() + config.waitTimeoutMs;

  while (Date.now() < deadline) {
    try {
      const currentUser = await jiraRequest("/rest/api/2/myself");
      const identifier = currentUser.name ?? currentUser.key ?? config.username;
      console.log(`Authenticated to Jira as ${identifier}`);
      return;
    } catch (error) {
      if (
        error instanceof JiraRequestError &&
        [401, 403, 404, 429, 500, 502, 503].includes(error.status)
      ) {
        console.log(
          "Jira is not ready for authenticated API calls yet. Finish the setup wizard and keep the stack running.",
        );
        await delay(config.waitIntervalMs);
        continue;
      }

      throw error;
    }
  }

  throw new Error(
    "Timed out waiting for Jira. Finish the first-run setup wizard, confirm the admin credentials, and rerun the bootstrap step.",
  );
}

async function ensureProject(currentUser) {
  const existing = await getProject(config.projectKey);

  if (existing) {
    console.log(`Using existing Jira project ${existing.key}`);
    return { project: existing, created: false };
  }

  const projectLead = currentUser.name ?? currentUser.key ?? config.username;
  console.log(`Creating Jira project ${config.projectKey}`);

  const created = await jiraRequest("/rest/api/2/project", {
    method: "POST",
    body: {
      assigneeType: "PROJECT_LEAD",
      description: "Local Jira project seeded for Agile Tools testing",
      key: config.projectKey,
      lead: projectLead,
      name: config.projectName,
      projectTemplateKey: "com.pyxis.greenhopper.jira:gh-kanban-template",
      projectTypeKey: "software",
    },
  });

  const project = (await getProject(created.key ?? config.projectKey)) ?? created;
  return { project, created: true };
}

async function getProject(projectKey) {
  try {
    return await jiraRequest(`/rest/api/2/project/${encodeURIComponent(projectKey)}`);
  } catch (error) {
    if (isStatus(error, 404)) {
      return null;
    }

    throw error;
  }
}

async function ensureBoard(project, waitForTemplateBoard) {
  const existing = waitForTemplateBoard
    ? await waitForBoard(project.key, 6)
    : await findBoard(project.key);

  if (existing) {
    console.log(`Using existing Jira board ${existing.name} (${existing.id})`);
    return getBoardDetails(existing.id);
  }

  const filter = await createFilter(project.key);
  console.log(`Creating Jira board ${config.boardName}`);
  const created = await jiraRequest("/rest/agile/1.0/board", {
    method: "POST",
    body: {
      filterId: Number(filter.id),
      name: config.boardName,
      type: "kanban",
    },
  });

  return getBoardDetails(created.id);
}

async function waitForBoard(projectKey, attempts) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const board = await findBoard(projectKey);

    if (board) {
      return board;
    }

    await delay(config.waitIntervalMs);
  }

  return null;
}

async function findBoard(projectKey) {
  const boards = await jiraRequest("/rest/agile/1.0/board", {
    query: {
      maxResults: 50,
      projectKeyOrId: projectKey,
      type: "kanban",
    },
  });

  const values = boards.values ?? [];
  return (
    values.find((board) => board.name === config.boardName) ??
    values[0] ??
    null
  );
}

async function createFilter(projectKey) {
  console.log(`Creating Jira filter ${config.filterName}`);
  return jiraRequest("/rest/api/2/filter", {
    method: "POST",
    body: {
      description: "Filter seeded for local Agile Tools testing",
      jql: `project = ${projectKey} ORDER BY Rank ASC`,
      name: config.filterName,
    },
  });
}

async function getBoardDetails(boardId) {
  const [board, configuration] = await Promise.all([
    jiraRequest(`/rest/agile/1.0/board/${boardId}`),
    jiraRequest(`/rest/agile/1.0/board/${boardId}/configuration`),
  ]);

  return {
    filterId: configuration?.filter?.id ?? null,
    id: board.id,
    name: board.name,
    type: board.type,
  };
}

async function ensureSampleIssues(projectKey) {
  const bootstrapJql = buildBootstrapIssueJql(projectKey);
  const existing = await searchIssues(
    bootstrapJql,
  );

  if (existing.length > 0) {
    console.log(`Reusing ${existing.length} bootstrap issue(s)`);
    return existing;
  }

  const issueType = await chooseIssueType(projectKey);
  const issuesToCreate = buildIssuePlan(config.sampleIssueCount);

  for (const issuePlan of issuesToCreate) {
    const createdIssue = await createIssue(projectKey, issueType, issuePlan.summary);
    await applyTransitions(createdIssue.key, issuePlan.transitions);
  }

  return searchIssues(bootstrapJql);
}

function buildBootstrapIssueJql(projectKey) {
  const label = config.issueLabel.replace(/"/g, '\\"');
  return `project = ${projectKey} AND labels = "${label}" ORDER BY created ASC`;
}

function buildIssuePlan(sampleIssueCount) {
  const plans = [];

  if (sampleIssueCount >= 1) {
    plans.push({
      summary: "[AT] Bootstrap To Do",
      transitions: [],
    });
  }

  if (sampleIssueCount >= 2) {
    plans.push({
      summary: "[AT] Bootstrap In Progress",
      transitions: [["In Progress", "Doing", "Selected for Development"]],
    });
  }

  if (sampleIssueCount >= 3) {
    plans.push({
      summary: "[AT] Bootstrap Done",
      transitions: [
        ["In Progress", "Doing", "Selected for Development"],
        ["Done", "Closed", "Resolved"],
      ],
    });
  }

  while (plans.length < sampleIssueCount) {
    plans.push({
      summary: `[AT] Bootstrap Backlog ${plans.length - 1}`,
      transitions: [],
    });
  }

  return plans;
}

async function chooseIssueType(projectKey) {
  const statusGroups = await jiraRequest(
    `/rest/api/2/project/${encodeURIComponent(projectKey)}/statuses`,
  );
  const preferred = ["Task", "Story", "Bug"];
  const issueTypes = Array.isArray(statusGroups) ? statusGroups : [];

  for (const preferredName of preferred) {
    const match = issueTypes.find((issueType) => issueType.name === preferredName);
    if (match) {
      return { id: match.id, name: match.name };
    }
  }

  const fallback = issueTypes[0];

  if (!fallback) {
    throw new Error(
      `Jira project ${projectKey} did not return any issue types from /statuses`,
    );
  }

  return { id: fallback.id, name: fallback.name };
}

async function createIssue(projectKey, issueType, summary) {
  console.log(`Creating Jira issue ${summary}`);
  return jiraRequest("/rest/api/2/issue", {
    method: "POST",
    body: {
      fields: {
        issuetype: { id: issueType.id },
        labels: [config.issueLabel],
        project: { key: projectKey },
        summary,
      },
    },
  });
}

async function applyTransitions(issueKey, transitionPreferenceSets) {
  for (const preferredNames of transitionPreferenceSets) {
    const transitioned = await transitionIssue(issueKey, preferredNames);

    if (!transitioned) {
      console.log(
        `No matching Jira transition found for ${issueKey}: ${preferredNames.join(", ")}`,
      );
    }
  }
}

async function transitionIssue(issueKey, preferredNames) {
  const response = await jiraRequest(
    `/rest/api/2/issue/${encodeURIComponent(issueKey)}/transitions`,
  );
  const transitions = response.transitions ?? [];
  const preferredSet = new Set(preferredNames.map((name) => name.toLowerCase()));
  const match = transitions.find((transition) => {
    const transitionName = transition.name?.toLowerCase();
    const destinationName = transition.to?.name?.toLowerCase();
    return preferredSet.has(transitionName) || preferredSet.has(destinationName);
  });

  if (!match) {
    return false;
  }

  await jiraRequest(
    `/rest/api/2/issue/${encodeURIComponent(issueKey)}/transitions`,
    {
      method: "POST",
      body: {
        transition: {
          id: match.id,
        },
      },
    },
  );

  return true;
}

async function searchIssues(jql) {
  const searchResult = await jiraRequest("/rest/api/2/search", {
    query: {
      fields: "summary,status",
      jql,
      maxResults: config.sampleIssueCount,
    },
  });

  return (searchResult.issues ?? []).map((issue) => ({
    id: issue.id,
    key: issue.key,
    status: issue.fields?.status?.name ?? null,
    summary: issue.fields?.summary ?? null,
  }));
}

async function ensurePat() {
  const previousOutput = await readBootstrapOutput();
  const previousToken = previousOutput?.pat?.token;

  if (previousToken && (await isExistingPatValid(previousToken))) {
    console.log(`Reusing PAT ${previousOutput.pat.name}`);
    return previousOutput.pat;
  }

  try {
    console.log(`Creating Jira PAT ${config.patName}`);
    const response = await jiraRequest("/rest/pat/latest/tokens", {
      method: "POST",
      body: {
        expirationDuration: config.patExpirationDays,
        name: config.patName,
      },
    });
    const token = extractPatToken(response);

    return {
      expirationDays: config.patExpirationDays,
      name: config.patName,
      raw: response,
      token,
    };
  } catch (error) {
    if (error instanceof JiraRequestError) {
      console.warn(
        `Skipping PAT creation because Jira returned ${error.status}. Create a PAT manually in Jira if PATs are disabled on this instance.`,
      );
      return null;
    }

    throw error;
  }
}

async function isExistingPatValid(token) {
  try {
    await jiraRequest("/rest/api/2/myself", {
      auth: {
        token,
        type: "bearer",
      },
    });
    return true;
  } catch {
    return false;
  }
}

function extractPatToken(response) {
  if (typeof response === "string" && response.trim().length > 0) {
    return response.trim();
  }

  const candidates = [
    response?.token,
    response?.rawToken,
    response?.accessToken,
    response?.value,
  ];

  const match = candidates.find(
    (candidate) => typeof candidate === "string" && candidate.trim().length > 0,
  );

  if (!match) {
    throw new Error(
      `Jira PAT response did not include a recognizable token field: ${JSON.stringify(response)}`,
    );
  }

  return match;
}

async function readBootstrapOutput() {
  try {
    const existing = await readFile(config.outputPath, "utf8");
    return JSON.parse(existing);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function writeBootstrapOutput(output) {
  await mkdir(dirname(config.outputPath), { recursive: true });
  await writeFile(config.outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}