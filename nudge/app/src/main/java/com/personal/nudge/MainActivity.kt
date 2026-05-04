package com.personal.nudge

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.room.*
import com.personal.nudge.ai.OpenAiClient
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

@Entity(tableName = "tasks")
data class TaskEntity(@PrimaryKey(autoGenerate = true) val id: Long = 0, val title: String, val description: String = "", val dueAt: Long? = null, val priority: String = "medium", val category: String = "general", val recurrence: String? = null, val reminderAt: Long? = null, val source: String = "manual", val confidence: Double = 1.0, val completed: Boolean = false, val createdAt: Long = System.currentTimeMillis())

@Entity(tableName = "notification_suggestions")
data class NotificationSuggestionEntity(@PrimaryKey(autoGenerate = true) val id: Long = 0, val appName: String, val sender: String, val message: String, val timestamp: Long, val hash: String, val status: String = "pending")

@Entity(tableName = "reminders")
data class ReminderEntity(@PrimaryKey(autoGenerate = true) val id: Long = 0, val taskId: Long, val remindAt: Long, val isExact: Boolean = true)

@Entity(tableName = "settings")
data class SettingsEntity(@PrimaryKey val id: Int = 1, val openAiApiKey: String = "", val model: String = "gpt-4.1-mini", val monitoredAppsCsv: String = "", val alarmSound: Boolean = true, val vibration: Boolean = true, val defaultReminderMins: Int = 30, val defaultPriority: String = "medium")

@Dao interface TaskDao { @Query("SELECT * FROM tasks WHERE completed=0 ORDER BY dueAt IS NULL, dueAt") fun active(): Flow<List<TaskEntity>>; @Insert suspend fun add(task: TaskEntity); @Update suspend fun update(task: TaskEntity)}
@Dao interface SuggestionDao { @Query("SELECT * FROM notification_suggestions WHERE status='pending' ORDER BY timestamp DESC") fun pending(): Flow<List<NotificationSuggestionEntity>>; @Insert(onConflict = OnConflictStrategy.IGNORE) suspend fun add(item: NotificationSuggestionEntity)}
@Dao interface SettingsDao { @Query("SELECT * FROM settings WHERE id=1") fun settings(): Flow<SettingsEntity?>; @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun upsert(s: SettingsEntity)}

@Database(entities = [TaskEntity::class, NotificationSuggestionEntity::class, ReminderEntity::class, SettingsEntity::class], version = 1)
abstract class NudgeDb : RoomDatabase() { abstract fun taskDao(): TaskDao; abstract fun suggestionDao(): SuggestionDao; abstract fun settingsDao(): SettingsDao }

class HomeVm(private val db: NudgeDb) : ViewModel() {
    val tasks = db.taskDao().active().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    var input by mutableStateOf("")
    fun process(source: String = "manual") { viewModelScope.launch {
        val t = OpenAiClient.extractTask(db.settingsDao().settings().first()?.openAiApiKey.orEmpty(), input, source)
        db.taskDao().add(TaskEntity(title = t.title, description = t.description, dueAt = t.dueAt, priority = t.priority, recurrence = t.recurrence, reminderAt = t.reminderAt, source = source, confidence = t.confidence))
        input = ""
    }}
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val db = Room.databaseBuilder(this, NudgeDb::class.java, "nudge.db").fallbackToDestructiveMigration().build()
        setContent {
            val vm = remember { ViewModelProvider(this, object: ViewModelProvider.Factory{ override fun <T : ViewModel> create(c: Class<T>): T = HomeVm(db) as T })[HomeVm::class.java] }
            MaterialTheme(colorScheme = darkColorScheme()) {
                Surface { HomeScreen(vm) }
            }
        }
    }
}

@Composable
fun HomeScreen(vm: HomeVm) {
    val tasks by vm.tasks.collectAsState()
    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Brain Dump", style = MaterialTheme.typography.headlineSmall)
        OutlinedTextField(value = vm.input, onValueChange = { vm.input = it }, modifier = Modifier.fillMaxWidth().height(160.dp), placeholder = { Text("Dump thoughts, voice notes, notifications…") })
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = { vm.process("manual") }) { Text("Process") }
            Button(onClick = { vm.process("voice") }) { Text("Voice") }
        }
        Text("Today")
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(tasks) { t -> Card { Column(Modifier.padding(12.dp)) { Text(t.title); Text("${t.priority} • ${t.source}") } } }
        }
    }
}
