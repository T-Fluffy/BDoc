using BDoc.Domain.Entities;
using BDoc.Domain.Interfaces;
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
}