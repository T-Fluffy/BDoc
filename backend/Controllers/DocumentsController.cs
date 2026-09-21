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

    public DocumentsController(IDocumentRepository repository)
    {
        _repository = repository;
    }

    private Guid? CurrentUserId()
    {
        var val = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Sub);
        return Guid.TryParse(val, out var g) ? g : null;
    }

    private bool CanAccess(Document doc)
    {
        var uid = CurrentUserId();
        if (uid is null) return false;
        if (doc.OwnerId is null) return true; // legacy docs
        return doc.OwnerId == uid;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var uid = CurrentUserId();
        if (uid is null) return Unauthorized();
        var all = await _repository.GetAllAsync();
        var mine = all.Where(d => d.OwnerId == uid || d.OwnerId == null);
        return Ok(mine);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> Get(Guid id)
    {
        try
        {
            var doc = await _repository.GetByIdAsync(id);
            if (!CanAccess(doc)) return Forbid();
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
        doc.OwnerId = uid;
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
            if (!CanAccess(existing)) return Forbid();
            updatedDoc.OwnerId = existing.OwnerId ?? CurrentUserId();
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
            if (!CanAccess(doc)) return Forbid();
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
        if (!CanAccess(doc)) return Forbid();
        var bytes = await DocxService.ToDocxAsync(doc.Content, doc.Settings);
        return File(
            bytes,
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            $"{DocxService.SanitizeFileName(doc.Title)}.docx");
    }

    [HttpPost("import")]
    [AllowAnonymous]
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
        if (!CanAccess(doc)) return Forbid();
        return Ok(await _repository.GetVersionsAsync(id));
    }

    [HttpPost("{id}/restore/{versionId}")]
    public async Task<IActionResult> Restore(Guid id, Guid versionId)
    {
        var version = await _repository.GetVersionAsync(id, versionId);
        if (version is null) return NotFound("Version not found");
        var doc = await _repository.GetByIdAsync(id);
        if (!CanAccess(doc)) return Forbid();
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
}