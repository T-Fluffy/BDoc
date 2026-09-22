using System.Security.Claims;
using BDoc.Domain.Entities;
using BDoc.Domain.Interfaces;
using BDoc.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BDoc.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class DocumentsController : ControllerBase
{
    private readonly IDocumentRepository _repository;
    private readonly AuthService _auth;

    public DocumentsController(IDocumentRepository repository, AuthService auth)
    {
        _repository = repository;
        _auth = auth;
    }

    private Guid? CurrentUserId()
    {
        var val = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Sub);
        return Guid.TryParse(val, out var g) ? g : null;
    }

    /// <summary>"owner", "editor", "viewer", or null (no access).</summary>
    private async Task<string?> AccessLevelAsync(Document doc, Guid? uid)
    {
        if (uid is null) return null;
        if (doc.OwnerId == uid) return "owner";
        var share = await _repository.GetShareAsync(doc.Id, uid.Value);
        return share?.Permission;
    }

    private bool IsOwner(Document doc, Guid? uid) => uid is not null && doc.OwnerId == uid;

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var uid = CurrentUserId();
        if (uid is null) return Unauthorized();
        var sharedIds = await _repository.GetSharedDocumentIdsAsync(uid.Value);
        var all = await _repository.GetAllAsync();
        var visible = all.Where(d => d.OwnerId == uid || sharedIds.Contains(d.Id)).ToList();
        foreach (var d in visible) d.SharedWithMe = d.OwnerId != uid;
        return Ok(visible);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> Get(Guid id)
    {
        try
        {
            var doc = await _repository.GetByIdAsync(id);
            if (await AccessLevelAsync(doc, CurrentUserId()) is null) return Forbid();
            return Ok(doc);
        }
        catch (Exception ex)
        {
            return NotFound(ex.Message);
        }
    }

    [HttpPost]
    public async Task<IActionResult> Create(Document doc)
    {
        var uid = CurrentUserId();
        if (uid is null) return Unauthorized();
        doc.OwnerId = uid;
        // Clients may send local-offset timestamps; Postgres requires UTC.
        doc.UpdatedAt = doc.UpdatedAt.Kind == DateTimeKind.Utc ? doc.UpdatedAt : doc.UpdatedAt.ToUniversalTime();
        await _repository.CreateAsync(doc);
        return CreatedAtAction(nameof(Get), new { id = doc.Id }, doc);
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(Guid id, Document updatedDoc)
    {
        if (id != updatedDoc.Id) return BadRequest("ID mismatch");
        try
        {
            var existing = await _repository.GetByIdAsync(id);
            // OwnerId is never transferred from the client.
            updatedDoc.OwnerId = existing.OwnerId;
            if (await AccessLevelAsync(existing, CurrentUserId()) is not ("owner" or "editor")) return Forbid();
            await _repository.UpdateAsync(updatedDoc);
            return NoContent();
        }
        catch (Exception ex)
        {
            return NotFound(ex.Message);
        }
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        try
        {
            var doc = await _repository.GetByIdAsync(id);
            if (!IsOwner(doc, CurrentUserId())) return Forbid();
            await _repository.DeleteAsync(id);
            return NoContent();
        }
        catch
        {
            return NoContent();
        }
    }

    [HttpGet("{id}/export")]
    public async Task<IActionResult> Export(Guid id)
    {
        var doc = await _repository.GetByIdAsync(id);
        if (await AccessLevelAsync(doc, CurrentUserId()) is null) return Forbid();
        var bytes = await DocxService.ToDocxAsync(doc.Content, doc.Settings);
        return File(
            bytes,
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            $"{DocxService.SanitizeFileName(doc.Title)}.docx");
    }

    [HttpPost("import")]
    public async Task<IActionResult> Import(IFormFile file)
    {
        if (file is null || file.Length == 0) return BadRequest("No file uploaded");
        using var ms = new MemoryStream();
        await file.CopyToAsync(ms);
        var result = DocxToHtmlService.ConvertWithSettings(ms.ToArray());
        return Ok(new { html = result.Html, settings = result.SettingsJson });
    }

    [HttpGet("{id}/versions")]
    public async Task<IActionResult> GetVersions(Guid id)
    {
        var doc = await _repository.GetByIdAsync(id);
        if (await AccessLevelAsync(doc, CurrentUserId()) is null) return Forbid();
        return Ok(await _repository.GetVersionsAsync(id));
    }

    [HttpPost("{id}/restore/{versionId}")]
    public async Task<IActionResult> Restore(Guid id, Guid versionId)
    {
        var version = await _repository.GetVersionAsync(id, versionId);
        if (version is null) return NotFound("Version not found");
        var doc = await _repository.GetByIdAsync(id);
        if (await AccessLevelAsync(doc, CurrentUserId()) is not ("owner" or "editor")) return Forbid();
        // Snapshot current before restore.
        await _repository.CreateVersionAsync(new DocumentVersion
        {
            DocumentId = doc.Id,
            Title = doc.Title,
            Content = doc.Content,
            Settings = doc.Settings,
            CreatedAt = DateTime.UtcNow,
        });
        doc.Title = version.Title;
        doc.Content = version.Content;
        doc.Settings = version.Settings;
        await _repository.UpdateAsync(doc);
        return Ok(doc);
    }

    public record ShareRequest(string Email, string Permission);

    [HttpGet("{id}/access")]
    public async Task<IActionResult> GetAccess(Guid id)
    {
        Document doc;
        try { doc = await _repository.GetByIdAsync(id); }
        catch (Exception ex) { return NotFound(ex.Message); }
        var level = await AccessLevelAsync(doc, CurrentUserId());
        if (level is null) return Forbid();
        return Ok(new { level });
    }

    [HttpGet("{id}/shares")]
    public async Task<IActionResult> GetShares(Guid id)
    {
        Document doc;
        try { doc = await _repository.GetByIdAsync(id); }
        catch (Exception ex) { return NotFound(ex.Message); }
        if (!IsOwner(doc, CurrentUserId())) return Forbid();
        var shares = await _repository.GetSharesAsync(id);
        var result = new List<object>();
        foreach (var s in shares)
        {
            var user = await _auth.FindByIdAsync(s.SharedWithUserId);
            if (user is null) continue;
            result.Add(new { userId = s.SharedWithUserId, email = user.Email, permission = s.Permission });
        }
        return Ok(result);
    }

    [HttpPost("{id}/shares")]
    public async Task<IActionResult> AddShare(Guid id, ShareRequest req)
    {
        var permission = req.Permission?.ToLowerInvariant();
        if (permission is not ("viewer" or "editor"))
            return BadRequest("Permission must be 'viewer' or 'editor'");
        Document doc;
        try { doc = await _repository.GetByIdAsync(id); }
        catch (Exception ex) { return NotFound(ex.Message); }
        var uid = CurrentUserId();
        if (!IsOwner(doc, uid)) return Forbid();
        var user = await _auth.FindByEmailAsync(req.Email);
        if (user is null) return NotFound("No user with that email");
        if (user.Id == uid) return BadRequest("Document is already yours");
        var share = await _repository.UpsertShareAsync(new DocumentShare
        {
            DocumentId = id,
            SharedWithUserId = user.Id,
            Permission = permission,
        });
        return Ok(new { userId = user.Id, email = user.Email, permission = share.Permission });
    }

    [HttpDelete("{id}/shares/{userId}")]
    public async Task<IActionResult> RevokeShare(Guid id, Guid userId)
    {
        Document doc;
        try { doc = await _repository.GetByIdAsync(id); }
        catch (Exception ex) { return NotFound(ex.Message); }
        if (!IsOwner(doc, CurrentUserId())) return Forbid();
        await _repository.RevokeShareAsync(id, userId);
        return NoContent();
    }
}