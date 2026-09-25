package com.example.apkextractor

import android.app.Application
import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.DocumentsContract
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.IOException
import java.security.MessageDigest
import java.text.DateFormat
import java.time.Instant
import java.util.Date
import java.util.Locale
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import kotlin.math.ln
import kotlin.math.pow

enum class ApkType { SINGLE, SPLIT }
enum class AppCategory { USER, SYSTEM }
enum class SortMode { NAME, SIZE, UPDATED }
enum class ThemeMode { SYSTEM, LIGHT, DARK }

data class InstalledApp(
    val label: String,
    val packageName: String,
    val versionName: String,
    val versionCode: Long,
    val apkSizeBytes: Long?,
    val firstInstallTime: Long,
    val lastUpdateTime: Long,
    val category: AppCategory,
    val apkType: ApkType,
)

data class ExportedFile(
    val packageName: String,
    val displayName: String,
    val uri: Uri,
    val apkType: ApkType,
)

data class UiState(
    val loading: Boolean = true,
    val apps: List<InstalledApp> = emptyList(),
    val query: String = "",
    val category: AppCategory = AppCategory.USER,
    val sort: SortMode = SortMode.NAME,
    val ascending: Boolean = true,
    val selected: Set<String> = emptySet(),
    val detailsPackage: String? = null,
    val exporting: Boolean = false,
    val exportCurrent: Int = 0,
    val exportTotal: Int = 0,
    val exportLabel: String = "",
    val destinationTreeUri: String? = null,
    val lastExports: List<ExportedFile> = emptyList(),
    val message: String? = null,
    val messageId: Long = 0L,
    val themeMode: ThemeMode = ThemeMode.SYSTEM,
)

class MainActivity : ComponentActivity() {
    private val viewModel: MainViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            val state by viewModel.uiState.collectAsState()
            ApkExtractorTheme(state.themeMode) {
                MainScreen(state, viewModel)
            }
        }
    }
}

class MainViewModel(application: Application) : AndroidViewModel(application) {
    private val repository = InstalledAppsRepository(application)
    private val exporter = ApkExporter(application)

    private val _uiState = MutableStateFlow(UiState())
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    init { refresh() }

    fun refresh() {
        if (_uiState.value.exporting) return
        viewModelScope.launch {
            _uiState.update { it.copy(loading = true) }
            runCatching { repository.load() }
                .onSuccess { apps ->
                    _uiState.update { old ->
                        old.copy(
                            loading = false,
                            apps = apps,
                            selected = old.selected.intersect(apps.map { it.packageName }.toSet()),
                        )
                    }
                }
                .onFailure { error ->
                    _uiState.update { it.copy(loading = false) }
                    postMessage("Не удалось получить список приложений: " + (error.message ?: error.javaClass.simpleName))
                }
        }
    }

    fun setQuery(value: String) = _uiState.update { it.copy(query = value) }
    fun setCategory(value: AppCategory) = _uiState.update { it.copy(category = value) }
    fun setSort(value: SortMode) = _uiState.update {
        if (it.sort == value) it.copy(ascending = !it.ascending)
        else it.copy(sort = value, ascending = value == SortMode.NAME)
    }
    fun toggleSortDirection() = _uiState.update { it.copy(ascending = !it.ascending) }
    fun showDetails(packageName: String) = _uiState.update { it.copy(detailsPackage = packageName) }
    fun dismissDetails() = _uiState.update { it.copy(detailsPackage = null) }

    fun toggleSelection(packageName: String) = _uiState.update {
        val next = it.selected.toMutableSet()
        if (!next.add(packageName)) next.remove(packageName)
        it.copy(selected = next)
    }

    fun clearSelection() = _uiState.update { it.copy(selected = emptySet()) }

    fun cycleTheme() = _uiState.update {
        val next = when (it.themeMode) {
            ThemeMode.SYSTEM -> ThemeMode.LIGHT
            ThemeMode.LIGHT -> ThemeMode.DARK
            ThemeMode.DARK -> ThemeMode.SYSTEM
        }
        it.copy(themeMode = next)
    }

    fun postMessage(text: String) = _uiState.update {
        it.copy(message = text, messageId = it.messageId + 1)
    }

    fun consumeMessage() = _uiState.update { it.copy(message = null) }

    fun exportPackages(packageNames: Collection<String>, treeUri: Uri) {
        if (_uiState.value.exporting) return
        val byPackage = _uiState.value.apps.associateBy { it.packageName }
        val apps = packageNames.distinct().mapNotNull(byPackage::get)
        if (apps.isEmpty()) {
            postMessage("Не выбрано ни одного приложения.")
            return
        }

        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    exporting = true,
                    exportCurrent = 0,
                    exportTotal = apps.size,
                    exportLabel = apps.first().label,
                    destinationTreeUri = treeUri.toString(),
                    lastExports = emptyList(),
                )
            }

            val successes = mutableListOf<ExportedFile>()
            val failures = mutableListOf<String>()

            apps.forEachIndexed { index, app ->
                _uiState.update { it.copy(exportCurrent = index, exportLabel = app.label) }
                try {
                    successes += withContext(Dispatchers.IO) { exporter.export(app, treeUri) }
                } catch (e: Exception) {
                    failures += app.label + ": " + (e.message ?: e.javaClass.simpleName)
                }
                _uiState.update { it.copy(exportCurrent = index + 1) }
            }

            _uiState.update {
                it.copy(
                    exporting = false,
                    exportLabel = "",
                    selected = emptySet(),
                    lastExports = successes,
                )
            }

            val message = when {
                successes.size == 1 && failures.isEmpty() -> "APK успешно сохранён: " + successes.first().displayName
                successes.isNotEmpty() && failures.isEmpty() -> "Успешно экспортировано: " + successes.size
                successes.isNotEmpty() -> "Экспортировано " + successes.size + ", ошибок: " + failures.size
                else -> failures.firstOrNull() ?: "Экспорт не выполнен."
            }
            postMessage(message)
        }
    }
}

class InstalledAppsRepository(context: Context) {
    private val packageManager = context.applicationContext.packageManager

    suspend fun load(): List<InstalledApp> = withContext(Dispatchers.IO) {
        val flags = PackageManager.MATCH_DISABLED_COMPONENTS.toLong()
        val packages = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            packageManager.getInstalledPackages(PackageManager.PackageInfoFlags.of(flags))
        } else {
            @Suppress("DEPRECATION")
            packageManager.getInstalledPackages(flags.toInt())
        }

        packages.mapNotNull { info ->
            val ai = info.applicationInfo ?: return@mapNotNull null
            val label = runCatching { ai.loadLabel(packageManager).toString() }.getOrDefault(info.packageName)
            val paths = buildList {
                ai.sourceDir?.let(::add)
                ai.splitSourceDirs?.let(::addAll)
            }
            val sizes = paths.mapNotNull { path ->
                runCatching { File(path).takeIf { it.isFile }?.length() }.getOrNull()
            }
            val size = sizes.takeIf { it.isNotEmpty() }?.sum()
            val system = ai.flags and ApplicationInfo.FLAG_SYSTEM != 0 ||
                ai.flags and ApplicationInfo.FLAG_UPDATED_SYSTEM_APP != 0
            val versionCode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                info.longVersionCode
            } else {
                @Suppress("DEPRECATION")
                info.versionCode.toLong()
            }
            InstalledApp(
                label = label,
                packageName = info.packageName,
                versionName = info.versionName ?: "unknown",
                versionCode = versionCode,
                apkSizeBytes = size,
                firstInstallTime = info.firstInstallTime,
                lastUpdateTime = info.lastUpdateTime,
                category = if (system) AppCategory.SYSTEM else AppCategory.USER,
                apkType = if (ai.splitSourceDirs.isNullOrEmpty()) ApkType.SINGLE else ApkType.SPLIT,
            )
        }
    }
}

class ApkExporter(context: Context) {
    private val appContext = context.applicationContext
    private val pm = appContext.packageManager
    private val resolver = appContext.contentResolver

    fun export(app: InstalledApp, treeUri: Uri): ExportedFile {
        val info = freshPackageInfo(app.packageName)
        val ai = info.applicationInfo ?: throw IOException("Нет ApplicationInfo.")
        val base = File(ai.sourceDir ?: throw IOException("Не найден base APK."))
        val splits = ai.splitSourceDirs?.map(::File).orEmpty()
        val files = listOf(base) + splits

        if (files.any { !it.isFile || !it.canRead() }) {
            throw IOException("Один или несколько APK недоступны для чтения.")
        }

        val versionName = info.versionName ?: app.versionName
        val baseName = sanitizeFileName(app.label) + "_" + sanitizeFileName(versionName, "unknown")
        val split = splits.isNotEmpty()
        val displayName = if (split) "$baseName.apks" else "$baseName.apk"
        val mime = if (split) "application/zip" else "application/vnd.android.package-archive"
        val treeId = DocumentsContract.getTreeDocumentId(treeUri)
        val parent = DocumentsContract.buildDocumentUriUsingTree(treeUri, treeId)
        val outputUri = DocumentsContract.createDocument(resolver, parent, mime, displayName)
            ?: throw IOException("Хранилище не создало файл.")

        try {
            if (split) writeApks(outputUri, app, info, ai, base, splits)
            else copyFile(base, outputUri)
        } catch (e: Exception) {
            runCatching { DocumentsContract.deleteDocument(resolver, outputUri) }
            throw e
        }

        return ExportedFile(app.packageName, displayName, outputUri, if (split) ApkType.SPLIT else ApkType.SINGLE)
    }

    private fun freshPackageInfo(packageName: String): PackageInfo =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            pm.getPackageInfo(packageName, PackageManager.PackageInfoFlags.of(0L))
        } else {
            @Suppress("DEPRECATION")
            pm.getPackageInfo(packageName, 0)
        }

    private fun copyFile(source: File, uri: Uri) {
        val output = resolver.openOutputStream(uri, "w") ?: throw IOException("Не удалось открыть выходной файл.")
        output.use { raw ->
            BufferedOutputStream(raw).use { out ->
                BufferedInputStream(FileInputStream(source)).use { input -> input.copyTo(out) }
            }
        }
    }

    private data class ArchivedApk(
        val file: String,
        val splitName: String?,
        val bytes: Long,
        val sha256: String,
    )

    private fun writeApks(
        uri: Uri,
        app: InstalledApp,
        info: PackageInfo,
        applicationInfo: ApplicationInfo,
        base: File,
        splits: List<File>,
    ) {
        val output = resolver.openOutputStream(uri, "w") ?: throw IOException("Не удалось открыть APKS.")
        output.use { raw ->
            ZipOutputStream(BufferedOutputStream(raw)).use { zip ->
                val archived = mutableListOf<ArchivedApk>()
                archived += addZipFile(zip, base, "base.apk", null)

                val splitNames = applicationInfo.splitNames?.toList().orEmpty()
                splits.forEachIndexed { index, file ->
                    val sourceName = file.name.takeIf { it.endsWith(".apk", true) } ?: "split_${index + 1}.apk"
                    val archiveName = if (sourceName == "base.apk") "split_${index + 1}.apk" else sourceName
                    val splitName = splitNames.getOrNull(index)
                        ?: archiveName.removePrefix("split_").removeSuffix(".apk")
                    archived += addZipFile(zip, file, archiveName, splitName)
                }

                val versionCode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) info.longVersionCode else {
                    @Suppress("DEPRECATION")
                    info.versionCode.toLong()
                }

                val apkJson = archived.joinToString(",\n") { entry ->
                    val splitJson = entry.splitName?.let { "\"\${jsonEscape(it)}\"" } ?: "null"
                    """    {
      "file": "${jsonEscape(entry.file)}",
      "splitName": $splitJson,
      "bytes": ${entry.bytes},
      "sha256": "${entry.sha256}"
    }"""
                }

                val manifest = """{
  "formatVersion": 1,
  "appName": "${jsonEscape(app.label)}",
  "packageName": "${jsonEscape(app.packageName)}",
  "versionName": "${jsonEscape(info.versionName ?: app.versionName)}",
  "versionCode": $versionCode,
  "exportedAt": "${Instant.now()}",
  "apks": [
$apkJson
  ]
}
"""
                zip.putNextEntry(ZipEntry("manifest.json"))
                zip.write(manifest.toByteArray(Charsets.UTF_8))
                zip.closeEntry()
            }
        }
    }

    private fun addZipFile(
        zip: ZipOutputStream,
        file: File,
        name: String,
        splitName: String?,
    ): ArchivedApk {
        val digest = MessageDigest.getInstance("SHA-256")
        var bytes = 0L
        val buffer = ByteArray(64 * 1024)

        zip.putNextEntry(ZipEntry(name))
        BufferedInputStream(FileInputStream(file)).use { input ->
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                if (count == 0) continue
                zip.write(buffer, 0, count)
                digest.update(buffer, 0, count)
                bytes += count
            }
        }
        zip.closeEntry()

        val sha256 = digest.digest().joinToString("") { "%02x".format(it) }
        return ArchivedApk(name, splitName, bytes, sha256)
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun MainScreen(state: UiState, viewModel: MainViewModel) {
    val context = LocalContext.current
    val snackbar = remember { SnackbarHostState() }
    var pendingPackages by remember { mutableStateOf<List<String>>(emptyList()) }

    val folderPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri ->
        val packages = pendingPackages
        pendingPackages = emptyList()
        if (uri == null) {
            viewModel.postMessage("Выбор папки отменён.")
        } else {
            val flags = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            runCatching { context.contentResolver.takePersistableUriPermission(uri, flags) }
            viewModel.exportPackages(packages, uri)
        }
    }

    fun requestExport(packages: Collection<String>) {
        if (state.exporting) return
        val list = packages.distinct()
        if (list.isEmpty()) {
            viewModel.postMessage("Не выбрано ни одного приложения.")
            return
        }
        pendingPackages = list
        folderPicker.launch(state.destinationTreeUri?.let(Uri::parse))
    }

    LaunchedEffect(state.messageId) {
        val message = state.message ?: return@LaunchedEffect
        snackbar.showSnackbar(message)
        viewModel.consumeMessage()
    }

    val visible = remember(state.apps, state.query, state.category, state.sort, state.ascending) {
        val q = state.query.trim().lowercase(Locale.getDefault())
        val comparator = when (state.sort) {
            SortMode.NAME -> compareBy<InstalledApp> { it.label.lowercase(Locale.getDefault()) }.thenBy { it.packageName }
            SortMode.SIZE -> compareBy<InstalledApp> { it.apkSizeBytes ?: -1L }.thenBy { it.label.lowercase(Locale.getDefault()) }
            SortMode.UPDATED -> compareBy<InstalledApp> { it.lastUpdateTime }.thenBy { it.label.lowercase(Locale.getDefault()) }
        }
        val result = state.apps.asSequence()
            .filter { it.category == state.category }
            .filter {
                q.isBlank() ||
                    it.label.lowercase(Locale.getDefault()).contains(q) ||
                    it.packageName.lowercase(Locale.getDefault()).contains(q)
            }
            .sortedWith(comparator)
            .toList()
        if (state.ascending) result else result.reversed()
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            TopAppBar(
                title = { Text("APK Extractor") },
                actions = {
                    TextButton(onClick = viewModel::cycleTheme) { Text(themeText(state.themeMode)) }
                    TextButton(onClick = viewModel::refresh, enabled = !state.exporting) { Text("Обновить") }
                },
            )
        },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 12.dp)
        ) {
            OutlinedTextField(
                value = state.query,
                onValueChange = viewModel::setQuery,
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Поиск приложения") },
                placeholder = { Text("Название или package name") },
                singleLine = true,
            )
            Spacer(Modifier.height(8.dp))

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(
                    selected = state.category == AppCategory.USER,
                    onClick = { viewModel.setCategory(AppCategory.USER) },
                    label = { Text("Пользовательские") },
                )
                FilterChip(
                    selected = state.category == AppCategory.SYSTEM,
                    onClick = { viewModel.setCategory(AppCategory.SYSTEM) },
                    label = { Text("Системные") },
                )
            }

            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                SortChip("Название", SortMode.NAME, state, viewModel)
                SortChip("Размер", SortMode.SIZE, state, viewModel)
                SortChip("Обновление", SortMode.UPDATED, state, viewModel)
                TextButton(onClick = viewModel::toggleSortDirection) { Text(if (state.ascending) "↑" else "↓") }
            }

            if (state.selected.isNotEmpty()) {
                Card(Modifier.fillMaxWidth()) {
                    Row(
                        Modifier.fillMaxWidth().padding(10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text("Выбрано: ${state.selected.size}", Modifier.weight(1f), fontWeight = FontWeight.SemiBold)
                        TextButton(onClick = viewModel::clearSelection) { Text("Снять") }
                        Button(onClick = { requestExport(state.selected) }, enabled = !state.exporting) {
                            Text("Экспорт")
                        }
                    }
                }
                Spacer(Modifier.height(8.dp))
            }

            if (state.exporting) {
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(10.dp)) {
                        Text("Экспорт ${state.exportCurrent}/${state.exportTotal}: ${state.exportLabel}")
                        Spacer(Modifier.height(6.dp))
                        LinearProgressIndicator(Modifier.fillMaxWidth())
                    }
                }
                Spacer(Modifier.height(8.dp))
            }

            if (state.lastExports.isNotEmpty()) {
                Card(Modifier.fillMaxWidth()) {
                    Row(
                        Modifier.fillMaxWidth().padding(10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            if (state.lastExports.size == 1) state.lastExports.first().displayName
                            else "Экспортировано файлов: ${state.lastExports.size}",
                            Modifier.weight(1f),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        TextButton(onClick = { shareExports(context, state.lastExports) }) { Text("Поделиться") }
                        TextButton(
                            onClick = {
                                state.destinationTreeUri?.let { openFolder(context, Uri.parse(it)) }
                            }
                        ) { Text("Папка") }
                    }
                }
                Spacer(Modifier.height(8.dp))
            }

            when {
                state.loading -> {
                    LinearProgressIndicator(Modifier.fillMaxWidth())
                    Spacer(Modifier.height(8.dp))
                    Text("Получение списка приложений…")
                }
                visible.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("Приложения не найдены")
                }
                else -> {
                    Text(
                        "Найдено: ${visible.size}. Долгое нажатие — множественный выбор.",
                        style = MaterialTheme.typography.bodySmall,
                    )
                    Spacer(Modifier.height(6.dp))
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                        contentPadding = PaddingValues(bottom = 24.dp),
                    ) {
                        items(visible, key = { it.packageName }) { app ->
                            AppRow(
                                app = app,
                                selected = app.packageName in state.selected,
                                selectionMode = state.selected.isNotEmpty(),
                                exporting = state.exporting,
                                onClick = {
                                    if (state.selected.isNotEmpty()) viewModel.toggleSelection(app.packageName)
                                    else viewModel.showDetails(app.packageName)
                                },
                                onLongClick = { viewModel.toggleSelection(app.packageName) },
                                onExport = { requestExport(listOf(app.packageName)) },
                            )
                        }
                    }
                }
            }
        }
    }

    state.detailsPackage?.let { packageName ->
        state.apps.firstOrNull { it.packageName == packageName }?.let { app ->
            AlertDialog(
                onDismissRequest = viewModel::dismissDetails,
                title = { Text(app.label) },
                text = {
                    Column {
                        Text(app.packageName)
                        Spacer(Modifier.height(8.dp))
                        Detail("Версия", app.versionName)
                        Detail("versionCode", app.versionCode.toString())
                        Detail("Тип", apkTypeText(app.apkType))
                        Detail("Размер", formatBytes(app.apkSizeBytes))
                        Detail("Установлено", formatDate(app.firstInstallTime))
                        Detail("Обновлено", formatDate(app.lastUpdateTime))
                        if (app.apkType == ApkType.SPLIT) {
                            Spacer(Modifier.height(8.dp))
                            Text(
                                "Будут сохранены base.apk и все split APK в одном .apks ZIP-контейнере.",
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                    }
                },
                confirmButton = {
                    Button(onClick = {
                        viewModel.dismissDetails()
                        requestExport(listOf(app.packageName))
                    }) {
                        Text(if (app.apkType == ApkType.SPLIT) "Экспортировать полный пакет" else "Извлечь APK")
                    }
                },
                dismissButton = { TextButton(onClick = viewModel::dismissDetails) { Text("Закрыть") } },
            )
        }
    }
}

@Composable
private fun SortChip(text: String, mode: SortMode, state: UiState, vm: MainViewModel) {
    FilterChip(selected = state.sort == mode, onClick = { vm.setSort(mode) }, label = { Text(text) })
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun AppRow(
    app: InstalledApp,
    selected: Boolean,
    selectionMode: Boolean,
    exporting: Boolean,
    onClick: () -> Unit,
    onLongClick: () -> Unit,
    onExport: () -> Unit,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .combinedClickable(enabled = !exporting, onClick = onClick, onLongClick = onLongClick),
        colors = CardDefaults.cardColors(
            containerColor = if (selected) MaterialTheme.colorScheme.secondaryContainer
            else MaterialTheme.colorScheme.surfaceVariant
        ),
    ) {
        Row(
            Modifier.fillMaxWidth().padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            AppIcon(app)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(app.label, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(app.packageName, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    "${app.versionName} • ${formatBytes(app.apkSizeBytes)} • ${apkTypeText(app.apkType)}",
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            if (!selectionMode) {
                Spacer(Modifier.width(8.dp))
                OutlinedButton(onClick = onExport, enabled = !exporting) { Text("Экспорт") }
            }
        }
    }
}

@Composable
private fun AppIcon(app: InstalledApp) {
    val context = LocalContext.current
    val bitmap = remember(app.packageName) {
        runCatching { context.packageManager.getApplicationIcon(app.packageName).toImageBitmap() }.getOrNull()
    }
    if (bitmap != null) {
        Image(
            bitmap = bitmap,
            contentDescription = app.label,
            modifier = Modifier.size(52.dp).clip(RoundedCornerShape(12.dp)),
            contentScale = ContentScale.Fit,
        )
    } else {
        Surface(Modifier.size(52.dp), shape = RoundedCornerShape(12.dp)) {
            Box(contentAlignment = Alignment.Center) { Text(app.label.take(1).uppercase()) }
        }
    }
}

@Composable
private fun Detail(label: String, value: String) {
    Row(Modifier.fillMaxWidth()) {
        Text(label, Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
        Text(value, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium)
    }
}

@Composable
fun ApkExtractorTheme(mode: ThemeMode, content: @Composable () -> Unit) {
    val dark = when (mode) {
        ThemeMode.SYSTEM -> isSystemInDarkTheme()
        ThemeMode.LIGHT -> false
        ThemeMode.DARK -> true
    }
    MaterialTheme(colorScheme = if (dark) darkColorScheme() else lightColorScheme(), content = content)
}

private fun apkTypeText(type: ApkType) = if (type == ApkType.SPLIT) "Split APK" else "Single APK"

private fun themeText(mode: ThemeMode) = when (mode) {
    ThemeMode.SYSTEM -> "Тема: авто"
    ThemeMode.LIGHT -> "Тема: светлая"
    ThemeMode.DARK -> "Тема: тёмная"
}

private fun formatBytes(bytes: Long?): String {
    if (bytes == null || bytes < 0) return "Размер неизвестен"
    if (bytes < 1024) return "$bytes B"
    val units = arrayOf("KB", "MB", "GB", "TB")
    val exp = (ln(bytes.toDouble()) / ln(1024.0)).toInt().coerceIn(1, units.size)
    return "%.1f %s".format(Locale.getDefault(), bytes / 1024.0.pow(exp.toDouble()), units[exp - 1])
}

private fun formatDate(value: Long): String =
    DateFormat.getDateInstance(DateFormat.MEDIUM).format(Date(value))

private val invalidFileNameChars = Regex("[\\\\/:*?\"<>|\\p{Cntrl}]")
private fun sanitizeFileName(value: String, fallback: String = "app"): String {
    val cleaned = value.trim()
        .replace(invalidFileNameChars, "_")
        .replace(Regex("_+"), "_")
        .trim(' ', '.', '_')
        .take(96)
    return cleaned.ifBlank { fallback }
}

private fun jsonEscape(value: String): String = buildString {
    value.forEach { ch ->
        when (ch) {
            '\\' -> append("\\\\")
            '"' -> append("\\\"")
            '\n' -> append("\\n")
            '\r' -> append("\\r")
            '\t' -> append("\\t")
            else -> if (ch.code < 0x20) append("\\u%04x".format(ch.code)) else append(ch)
        }
    }
}

private fun Drawable.toImageBitmap(): ImageBitmap {
    if (this is BitmapDrawable && bitmap != null) return bitmap.asImageBitmap()
    val width = intrinsicWidth.takeIf { it > 0 } ?: 96
    val height = intrinsicHeight.takeIf { it > 0 } ?: 96
    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    setBounds(0, 0, canvas.width, canvas.height)
    draw(canvas)
    return bitmap.asImageBitmap()
}

private fun shareExports(context: Context, files: List<ExportedFile>) {
    if (files.isEmpty()) return
    val uris = files.map { it.uri }
    val intent = if (uris.size == 1) {
        Intent(Intent.ACTION_SEND).apply {
            type = if (files.first().apkType == ApkType.SINGLE) "application/vnd.android.package-archive" else "application/zip"
            putExtra(Intent.EXTRA_STREAM, uris.first())
            clipData = ClipData.newUri(context.contentResolver, files.first().displayName, uris.first())
        }
    } else {
        Intent(Intent.ACTION_SEND_MULTIPLE).apply {
            type = "application/octet-stream"
            putParcelableArrayListExtra(Intent.EXTRA_STREAM, ArrayList(uris))
            val clip = ClipData.newUri(context.contentResolver, files.first().displayName, uris.first())
            uris.drop(1).forEach { clip.addItem(ClipData.Item(it)) }
            clipData = clip
        }
    }
    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    context.startActivity(Intent.createChooser(intent, "Поделиться APK"))
}

private fun openFolder(context: Context, treeUri: Uri) {
    val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
        putExtra(DocumentsContract.EXTRA_INITIAL_URI, treeUri)
        addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION or
                Intent.FLAG_GRANT_WRITE_URI_PERMISSION or
                Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION or
                Intent.FLAG_GRANT_PREFIX_URI_PERMISSION
        )
    }
    context.startActivity(intent)
}
