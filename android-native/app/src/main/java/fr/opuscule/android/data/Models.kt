package fr.opuscule.android.data

data class User(val id: String, val username: String)

data class Article(
    val id: String,
    val title: String,
    val excerpt: String?,
    val content: String?,
    val author: String?,
    val publishedOn: String?,
    val coverImage: String?,
    val commentCount: Int,
    val likeCount: Int,
    val readCount: Int,
    val likedByMe: Boolean,
    val canEdit: Boolean,
    val comments: List<Comment> = emptyList(),
)

data class Comment(
    val id: String,
    val parentId: String?,
    val body: String,
    val author: String?,
    val canEdit: Boolean,
    val createdAt: String?,
)

data class FileNode(
    val id: String,
    val parentId: String?,
    val name: String,
    val type: String,
    val depth: Int,
    val locked: Boolean,
    val encrypted: Boolean,
    val canEdit: Boolean,
    val children: List<FileNode>,
) {
    val isFolder: Boolean get() = type == "folder" || type == "locked_folder"
}

data class FileDetail(
    val id: String,
    val parentId: String?,
    val name: String,
    val type: String,
    val content: String,
    val contentVersion: Int,
    val canEdit: Boolean,
    val encrypted: Boolean,
)

data class ReviewQuestion(
    val key: String,
    val id: String,
    val fileId: String,
    val questionnaireTitle: String,
    val fileName: String,
    val prompt: String,
    val answer: String,
    val explanation: String,
    val kind: String,
    val type: String,
    val index: Int,
    val image: String?,
    val imageAlt: String?,
    val actorKey: String?,
    val sourceFileId: String?,
    val sourceFileName: String?,
    val sourceMissing: Boolean,
    val requireChange: Boolean,
)

data class DictionaryDefinition(val partOfSpeech: String, val definition: String, val example: String)
data class DictionaryEntry(
    val word: String,
    val language: String,
    val phonetic: String,
    val definitions: List<DictionaryDefinition>,
    val source: String,
    val sourceUrl: String,
)

data class ReviewResult(
    val questionKey: String,
    val correct: Boolean,
    val createdAt: String?,
)

data class Idea(
    val id: String,
    val content: String,
    val tags: String,
    val createdAt: String?,
)

data class Quote(
    val id: String,
    val quote: String,
    val author: String?,
    val source: String?,
    val notes: String?,
    val createdAt: String?,
)

data class FactCheck(
    val id: String,
    val claim: String,
    val status: String,
    val source: String?,
    val notes: String?,
    val createdAt: String?,
)

data class Todo(
    val id: String,
    val title: String,
    val notes: String?,
    val status: String,
    val dueAt: String,
)

data class Practice(
    val id: String,
    val title: String,
    val active: Boolean,
)

data class PracticeCheck(
    val practiceId: String,
    val entryDate: String,
    val done: Boolean,
)

data class LifeProfile(
    val birthDate: String?,
    val lifeExpectancyYears: Int,
)

data class Agenda(
    val today: String,
    val since: String,
    val practices: List<Practice>,
    val checks: List<PracticeCheck>,
    val profile: LifeProfile,
)

data class UsageDay(val date: String, val seconds: Int)
data class UsageMonth(val month: String, val seconds: Int, val activeDays: Int)

data class UsageSummary(
    val todaySeconds: Int,
    val weekSeconds: Int,
    val monthSeconds: Int,
    val averageDailyMonthSeconds: Int,
    val averageWeeklySeconds: Int,
    val totalSeconds: Int,
    val history: List<UsageDay>,
    val months: List<UsageMonth>,
)

class ApiException(val status: Int, message: String) : Exception(message)
