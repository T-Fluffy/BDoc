using BDoc.Domain.Entities;
using BDoc.Domain.Interfaces;
using BDoc.Services;
using Microsoft.AspNetCore.Mvc;

namespace BDoc.Controllers;

[ApiController]
[Route("api/[controller]")]
public class DocumentsController : ControllerBase
{
    private readonly IDocumentRepository _repository;

    public DocumentsController(IDocumentRepository repository)
    {
        _repository = repository;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll() => Ok(await _repository.GetAllAsync());

    [HttpGet("{id}")]
    public async Task<IActionResult> Get(Guid id)
    {
        try
        {
            return Ok(await _repository.GetByIdAsync(id));
        }
        catch (Exception ex)
        {
            return NotFound(ex.Message);
        }
    }

    [HttpPost]
    public async Task<IActionResult> Create(Document doc)
    {
        await _repository.CreateAsync(doc);
        return CreatedAtAction(nameof(Get), new { id = doc.Id }, doc);
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(Guid id, Document updatedDoc)
    {
        if (id != updatedDoc.Id) return BadRequest("ID mismatch");
        await _repository.UpdateAsync(updatedDoc);
        return NoContent();
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        await _repository.DeleteAsync(id);
        return NoContent();
    }

    [HttpGet("{id}/export")]
    public async Task<IActionResult> Export(Guid id)
    {
        var doc = await _repository.GetByIdAsync(id);
        var bytes = await DocxService.ToDocxAsync(doc.Content);
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
        var html = DocxToHtmlService.Convert(ms.ToArray());
        return Ok(new { html });
    }
}