using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BDoc.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddDocumentSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Settings",
                table: "Documents",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Settings",
                table: "Documents");
        }
    }
}
