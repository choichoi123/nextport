const NOTION_VERSION = '2025-09-03'
const REQUEST_TIMEOUT_MS = 10000

async function requestNotion(path, token, body) {
  let response

  try {
    response = await fetch(`https://api.notion.com/v1/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (error) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      throw new Error('Notion 요청 시간이 초과되었습니다. 네트워크 상태를 확인해 주세요.')
    }
    throw new Error('Notion에 연결할 수 없습니다. 네트워크 상태를 확인해 주세요.')
  }

  if (!response.ok) {
    const guidance = {
      400: 'DB/데이터 소스 ID와 Name(제목) 속성을 확인해 주세요.',
      401: 'NOTION_TOKEN이 올바른지 확인해 주세요.',
      403: 'Notion 연결에 콘텐츠 읽기 권한이 있는지 확인해 주세요.',
      404: 'DB/데이터 소스 ID와 해당 DB의 연결 추가 설정을 확인해 주세요.',
      429: 'Notion 요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.',
    }
    throw new Error(`Notion 요청 실패 (HTTP ${response.status}). ${guidance[response.status] || '잠시 후 다시 시도해 주세요.'}`)
  }

  try {
    return await response.json()
  } catch {
    throw new Error('Notion 응답을 읽을 수 없습니다. 잠시 후 다시 시도해 주세요.')
  }
}

export async function getNotionProjects({ token, databaseId, dataSourceId } = {}) {
  // Notion 설정 없이도 로컬에서 홈과 빈 프로젝트 목록을 확인할 수 있습니다.
  if (!token && !databaseId && !dataSourceId) return { results: [] }

  if (!token || (!databaseId && !dataSourceId)) {
    throw new Error('Notion 설정이 불완전합니다. NOTION_TOKEN과 NOTION_DATABASE_ID 또는 NOTION_DATA_SOURCE_ID를 설정해 주세요.')
  }

  let sourceId = dataSourceId
  if (!sourceId) {
    const database = await requestNotion(`databases/${encodeURIComponent(databaseId)}`, token)
    const sources = database.data_sources

    if (!Array.isArray(sources) || sources.length === 0) {
      throw new Error('Notion DB에서 데이터 소스를 찾지 못했습니다. DB ID와 연결 권한을 확인해 주세요.')
    }
    if (sources.length > 1) {
      throw new Error('Notion DB에 데이터 소스가 여러 개 있습니다. NOTION_DATA_SOURCE_ID로 프로젝트 데이터 소스를 지정해 주세요.')
    }
    sourceId = sources[0].id
    if (!sourceId) throw new Error('Notion 데이터 소스 ID를 읽을 수 없습니다.')
  }

  const results = []
  const seenCursors = new Set()
  let cursor

  do {
    const page = await requestNotion(`data_sources/${encodeURIComponent(sourceId)}/query`, token, {
      sorts: [{ property: 'Name', direction: 'ascending' }],
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    })

    if (!Array.isArray(page.results)) throw new Error('Notion 프로젝트 목록 응답 형식이 올바르지 않습니다.')
    results.push(...page.results)

    cursor = page.has_more ? page.next_cursor : null
    if (page.has_more && (typeof cursor !== 'string' || !cursor || seenCursors.has(cursor))) {
      throw new Error('Notion의 다음 페이지 정보를 읽을 수 없습니다.')
    }
    if (cursor) seenCursors.add(cursor)
  } while (cursor)

  return { results }
}
